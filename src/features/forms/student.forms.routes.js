const express = require("express");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");
const cloudinary = require("../../cloudinary");

const router = express.Router();

/**
 * @swagger
 * /student/forms:
 *   get:
 *     summary: Get forms available to the current student
 *     tags: [Student Forms]
 *     responses:
 *       200:
 *         description: List of forms available to the student
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
/**
 * GET /student/forms
 * Fetch forms available to current student
 */
router.get("/", requireAuth, async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				year: true,
				role: true,
			},
		});

		if (!user) {
			return res.status(404).json({
				message: "User not found",
			});
		}

		const forms = await prisma.formTemplate.findMany({
			where: {
				isActive: true,
				// OR: [{ year: null }, { year: user.year }],
			},
			orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
			include: {
				fields: {
					orderBy: { sortOrder: "asc" },
				},
				submissions: {
					where: {
						studentId: user.id,
					},
					select: {
						id: true,
						status: true,
						submittedAt: true,
					},
					take: 1,
				},
			},
		});

		const formsWithAvailability = forms.map((form) => {
			const submission = form.submissions?.[0] ?? null;
			return {
				...form,
				submission,
				isSubmitted: submission?.status === "submitted",
				isAvailableToStudent: !form.year || form.year === user.year,
			};
		});

		return res.json({ forms: formsWithAvailability });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/forms/{id}:
 *   get:
 *     summary: Get a single form available to the current student
 *     tags: [Student Forms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Form template ID
 *     responses:
 *       200:
 *         description: Form returned successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found or form not available to this student
 *       500:
 *         description: Server error
 */
/**
 * GET /student/forms/:id
 * Fetch one form for current student
 */
router.get("/:id", requireAuth, async (req, res) => {
	try {
		const { id } = req.params;

		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				year: true,
			},
		});

		if (!user) {
			return res.status(404).json({
				message: "User not found",
			});
		}

		const form = await prisma.formTemplate.findFirst({
			where: {
				id,
				isActive: true,
			},
			include: {
				fields: {
					orderBy: { sortOrder: "asc" },
				},
			},
		});

		if (!form) {
			return res.status(404).json({
				message: "Form not found",
			});
		}

		const submission = await prisma.formSubmission.findUnique({
			where: {
				formTemplateId_studentId: {
					formTemplateId: form.id,
					studentId: user.id,
				},
			},
			include: {
				answers: true,
			},
		});

		return res.json({
			form: {
				...form,
				isAvailableToStudent: !form.year || form.year === user.year,
			},
			submission,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/forms/{id}/submissions:
 *   post:
 *     summary: Create or update the current student's submission for a form
 *     tags: [Student Forms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Form template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               submitNow:
 *                 type: boolean
 *                 example: true
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - formFieldId
 *                   properties:
 *                     formFieldId:
 *                       type: string
 *                       example: c7c4f5a2-1e11-4f5f-a7ef-4f6f6d8f1234
 *                     valueText:
 *                       type: string
 *                       nullable: true
 *                       example: Vorahpong Mean
 *                     valueBoolean:
 *                       type: boolean
 *                       nullable: true
 *                       example: true
 *                     valueDate:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: 2026-04-05T00:00:00.000Z
 *                     valueSignatureUrl:
 *                       type: string
 *                       nullable: true
 *                       example: https://example.com/signatures/student-signature.png
 *     responses:
 *       201:
 *         description: Form submitted or draft saved successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found or form not available to this student
 *       500:
 *         description: Server error
 */
/**
 * POST /student/forms/:id/submissions
 * Create or update a student's submission
 */
router.post("/:id/submissions", requireAuth, async (req, res) => {
	try {
		const { id } = req.params;
		const { answers, submitNow } = req.body;

		if (!Array.isArray(answers)) {
			return res.status(400).json({
				message: "answers must be an array",
			});
		}

		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				year: true,
			},
		});

		if (!user) {
			return res.status(404).json({
				message: "User not found",
			});
		}

		const form = await prisma.formTemplate.findFirst({
			where: {
				id,
				isActive: true,
				OR: [{ year: null }, { year: user.year }],
			},
			include: {
				fields: true,
			},
		});

		if (!form) {
			return res.status(404).json({
				message: "Form not found or not available to this student",
			});
		}

		const existingSubmitted = await prisma.formSubmission.findUnique({
			where: {
				formTemplateId_studentId: {
					formTemplateId: form.id,
					studentId: user.id,
				},
			},
			select: {
				id: true,
				status: true,
			},
		});

		if (existingSubmitted && existingSubmitted.status !== "draft") {
			return res.status(409).json({
				message: "You have already submitted this form",
			});
		}

		const fieldMap = new Map(form.fields.map((f) => [f.id, f]));

		for (const answer of answers) {
			const field = fieldMap.get(answer.formFieldId);

			if (!field) {
				return res.status(400).json({
					message: `Invalid field id: ${answer.formFieldId}`,
				});
			}
		}

		if (submitNow) {
			for (const field of form.fields) {
				if (!field.required) continue;

				const answer = answers.find((a) => a.formFieldId === field.id);

				if (!answer) {
					return res.status(400).json({
						message: `Required field missing: ${field.label}`,
					});
				}

				const hasValue =
					answer.valueText != null ||
					answer.valueBoolean != null ||
					answer.valueDate != null ||
					answer.valueSignatureUrl != null;

				if (!hasValue) {
					return res.status(400).json({
						message: `Required field missing value: ${field.label}`,
					});
				}
			}
		}

		const savedSubmission = await prisma.$transaction(async (tx) => {
			let submission = await tx.formSubmission.findUnique({
				where: {
					formTemplateId_studentId: {
						formTemplateId: form.id,
						studentId: user.id,
					},
				},
			});

			if (!submission) {
				submission = await tx.formSubmission.create({
					data: {
						formTemplateId: form.id,
						studentId: user.id,
						status: submitNow ? "submitted" : "draft",
						submittedAt: submitNow ? new Date() : null,
					},
				});
			} else {
				submission = await tx.formSubmission.update({
					where: { id: submission.id },
					data: {
						status: submitNow ? "submitted" : submission.status,
						submittedAt: submitNow ? new Date() : submission.submittedAt,
					},
				});

				await tx.formAnswer.deleteMany({
					where: {
						submissionId: submission.id,
					},
				});
			}

			if (answers.length > 0) {
				await tx.formAnswer.createMany({
					data: answers.map((answer) => ({
						submissionId: submission.id,
						formFieldId: answer.formFieldId,
						valueText: answer.valueText ?? null,
						valueBoolean:
							typeof answer.valueBoolean === "boolean"
								? answer.valueBoolean
								: null,
						valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
						valueSignatureUrl: answer.valueSignatureUrl ?? null,
					})),
				});
			}

			return tx.formSubmission.findUnique({
				where: { id: submission.id },
				include: {
					answers: true,
				},
			});
		});

		return res.status(201).json({
			message: submitNow
				? "Form submitted successfully"
				: "Draft saved successfully",
			submission: savedSubmission,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/forms/signature:
 *   post:
 *     summary: Upload a student's signature image to Cloudinary
 *     tags: [Student Forms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dataUrl
 *             properties:
 *               dataUrl:
 *                 type: string
 *                 description: Base64-encoded image data URL
 *                 example: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
 *               oldUrl:
 *                 type: string
 *                 description: Existing Cloudinary URL to delete after successful replacement
 *                 example: https://res.cloudinary.com/your-cloud/image/upload/v123/signature.png
 *     responses:
 *       200:
 *         description: Signature uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   example: https://res.cloudinary.com/your-cloud/image/upload/v123/signature.png
 *       400:
 *         description: Invalid image or missing data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Upload failed
 */
router.post("/signature", requireAuth, async (req, res) => {
	try {
		const { dataUrl, oldUrl } = req.body;

		if (!dataUrl || typeof dataUrl !== "string") {
			return res.status(400).json({ message: "No image provided" });
		}

		if (!dataUrl.startsWith("data:image/")) {
			return res.status(400).json({ message: "Invalid image format" });
		}

		const result = await cloudinary.uploader.upload(dataUrl, {
			folder: "cuplus/signatures",
			resource_type: "image",
			format: "png",
		});

		// Delete old signature if provided
		if (oldUrl && typeof oldUrl === "string") {
			try {
				// Extract public_id from Cloudinary URL
				const parts = oldUrl.split("/");
				const fileWithExt = parts[parts.length - 1];
				const publicId = `cuplus/signatures/${fileWithExt.split(".")[0]}`;

				await cloudinary.uploader.destroy(publicId, {
					resource_type: "image",
				});
			} catch (err) {
				console.warn("Failed to delete old signature:", err);
			}
		}

		return res.json({
			url: result.secure_url,
		});
	} catch (error) {
		console.error(error);
		return res.status(500).json({ message: "Upload failed" });
	}
});

module.exports = router;
