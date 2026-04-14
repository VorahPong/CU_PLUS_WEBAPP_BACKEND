const express = require("express");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const cloudinary = require("../../cloudinary");

const {
	notifyStudentsForForm,
} = require("../notifications/notification.service");

const router = express.Router();

/**
 * @swagger
 * /admin/forms:
 *   post:
 *     summary: Create a new form template with fields
 *     tags: [Admin Forms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - fields
 *             properties:
 *               title:
 *                 type: string
 *                 example: 1st Year - Mid-Semester Grade Check - Fall
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Mid-semester grade check form
 *               year:
 *                 type: string
 *                 nullable: true
 *                 example: "1"
 *               folderId:
 *                 type: string
 *                 nullable: true
 *                 example: 7f2d5c40-1234-4f61-9d11-abcdef123456
 *               sortOrder:
 *                 type: integer
 *                 example: 0
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 example: 2026-10-20T23:59:00.000Z
 *               instructions:
 *                 type: string
 *                 nullable: true
 *                 example: Please complete all fields before the due date.
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - label
 *                     - type
 *                   properties:
 *                     label:
 *                       type: string
 *                       example: Student Name
 *                     type:
 *                       type: string
 *                       example: text
 *                     required:
 *                       type: boolean
 *                       example: true
 *                     placeholder:
 *                       type: string
 *                       nullable: true
 *                       example: Enter your full name
 *                     helpText:
 *                       type: string
 *                       nullable: true
 *                       example: Use your legal name
 *                     sortOrder:
 *                       type: integer
 *                       example: 0
 *                     configJson:
 *                       type: object
 *                       nullable: true
 *     responses:
 *       201:
 *         description: Form created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const {
			title,
			description,
			year,
			folderId,
			sortOrder,
			dueDate,
			instructions,
			fields,
		} = req.body;

		if (!title || !title.trim()) {
			return res.status(400).json({
				message: "title is required",
			});
		}

		if (!Array.isArray(fields) || fields.length === 0) {
			return res.status(400).json({
				message: "At least one field is required",
			});
		}

		const allowedTypes = [
			"text",
			"textarea",
			"date",
			"checkbox",
			"signature",
			"year",
		];

		for (let i = 0; i < fields.length; i++) {
			const field = fields[i];

			if (!field.label || !field.label.trim()) {
				return res.status(400).json({
					message: `Field ${i + 1}: label is required`,
				});
			}

			if (!field.type || !allowedTypes.includes(field.type)) {
				return res.status(400).json({
					message: `Field ${i + 1}: invalid field type`,
				});
			}
		}

		if (folderId) {
			const folder = await prisma.courseFolder.findUnique({
				where: { id: folderId },
			});

			if (!folder) {
				return res.status(404).json({
					message: "Folder not found",
				});
			}
		}

		const createdForm = await prisma.formTemplate.create({
			data: {
				title: title.trim(),
				description: description?.trim() || null,
				year: year || null,
				folderId: folderId || null,
				sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
				dueDate: dueDate ? new Date(dueDate) : null,
				instructions: instructions?.trim() || null,
				createdById: req.user.id,
				fields: {
					create: fields.map((field, index) => ({
						label: field.label.trim(),
						type: field.type,
						required: Boolean(field.required),
						placeholder: field.placeholder?.trim() || null,
						helpText: field.helpText?.trim() || null,
						sortOrder: field.sortOrder ?? index,
						configJson: field.configJson ?? null,
					})),
				},
			},
			include: {
				fields: {
					orderBy: { sortOrder: "asc" },
				},
				folder: true,
				createdBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						role: true,
					},
				},
			},
		});

		// create form
		await notifyStudentsForForm(createdForm);

		return res.status(201).json({
			message: "Form created successfully",
			form: createdForm,
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
 * /admin/forms:
 *   get:
 *     summary: Get all form templates
 *     tags: [Admin Forms]
 *     responses:
 *       200:
 *         description: List of form templates
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const forms = await prisma.formTemplate.findMany({
			orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
			include: {
				createdBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
					},
				},
				folder: true,
				fields: {
					orderBy: { sortOrder: "asc" },
				},
				_count: {
					select: {
						submissions: true,
					},
				},
			},
		});

		return res.json({ forms });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /admin/forms/{id}:
 *   get:
 *     summary: Get a single form template
 *     tags: [Admin Forms]
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
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Form not found
 *       500:
 *         description: Server error
 */
router.get("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const form = await prisma.formTemplate.findUnique({
			where: { id },
			include: {
				fields: {
					orderBy: { sortOrder: "asc" },
				},
				folder: true,
				createdBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
					},
				},
			},
		});

		if (!form) {
			return res.status(404).json({
				message: "Form not found",
			});
		}

		return res.json({ form });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /admin/forms/{id}:
 *   put:
 *     summary: Update a form template and replace its fields
 *     tags: [Admin Forms]
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
 *               - title
 *               - fields
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               year:
 *                 type: string
 *                 nullable: true
 *               folderId:
 *                 type: string
 *                 nullable: true
 *               sortOrder:
 *                 type: integer
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               instructions:
 *                 type: string
 *                 nullable: true
 *               isActive:
 *                 type: boolean
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - label
 *                     - type
 *                   properties:
 *                     label:
 *                       type: string
 *                     type:
 *                       type: string
 *                     required:
 *                       type: boolean
 *                     placeholder:
 *                       type: string
 *                       nullable: true
 *                     helpText:
 *                       type: string
 *                       nullable: true
 *                     sortOrder:
 *                       type: integer
 *                     configJson:
 *                       type: object
 *                       nullable: true
 *     responses:
 *       200:
 *         description: Form updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Form not found
 *       500:
 *         description: Server error
 */
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;
		const {
			title,
			description,
			year,
			folderId,
			sortOrder,
			dueDate,
			instructions,
			isActive,
			fields,
		} = req.body;

		const existing = await prisma.formTemplate.findUnique({
			where: { id },
			include: { fields: true },
		});

		if (!existing) {
			return res.status(404).json({
				message: "Form not found",
			});
		}

		if (!title || !title.trim()) {
			return res.status(400).json({
				message: "title is required",
			});
		}

		if (!Array.isArray(fields) || fields.length === 0) {
			return res.status(400).json({
				message: "At least one field is required",
			});
		}

		const allowedTypes = [
			"text",
			"textarea",
			"date",
			"checkbox",
			"signature",
			"year",
		];

		for (let i = 0; i < fields.length; i++) {
			const field = fields[i];

			if (!field.label || !field.label.trim()) {
				return res.status(400).json({
					message: `Field ${i + 1}: label is required`,
				});
			}

			if (!field.type || !allowedTypes.includes(field.type)) {
				return res.status(400).json({
					message: `Field ${i + 1}: invalid field type`,
				});
			}
		}

		if (folderId) {
			const folder = await prisma.courseFolder.findUnique({
				where: { id: folderId },
			});

			if (!folder) {
				return res.status(404).json({
					message: "Folder not found",
				});
			}
		}

		const updatedForm = await prisma.$transaction(async (tx) => {
			await tx.formField.deleteMany({
				where: { formTemplateId: id },
			});

			return tx.formTemplate.update({
				where: { id },
				data: {
					title: title.trim(),
					description: description?.trim() || null,
					year: year || null,
					folderId: folderId === undefined ? existing.folderId : folderId || null,
					sortOrder:
						typeof sortOrder === "number" ? sortOrder : existing.sortOrder,
					dueDate: dueDate ? new Date(dueDate) : null,
					instructions: instructions?.trim() || null,
					isActive:
						typeof isActive === "boolean" ? isActive : existing.isActive,
					fields: {
						create: fields.map((field, index) => ({
							label: field.label.trim(),
							type: field.type,
							required: Boolean(field.required),
							placeholder: field.placeholder?.trim() || null,
							helpText: field.helpText?.trim() || null,
							sortOrder: field.sortOrder ?? index,
							configJson: field.configJson ?? null,
						})),
					},
				},
				include: {
					fields: {
						orderBy: { sortOrder: "asc" },
					},
					folder: true,
				},
			});
		});

		return res.json({
			message: "Form updated successfully",
			form: updatedForm,
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
 * /admin/forms/{id}/submissions:
 *   get:
 *     summary: Get submissions for a form
 *     tags: [Admin Forms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Form template ID
 *     responses:
 *       200:
 *         description: List of submissions for the form
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/:id/submissions", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const submissions = await prisma.formSubmission.findMany({
			where: { formTemplateId: id },
			orderBy: { createdAt: "desc" },
			include: {
				student: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						schoolId: true,
						year: true,
					},
				},
				reviewedBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
					},
				},
			},
		});

		return res.json({ submissions });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /admin/forms/submissions/{submissionId}/detail:
 *   get:
 *     summary: Get full submission detail with answers
 *     tags: [Admin Forms]
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Submission ID
 *     responses:
 *       200:
 *         description: Submission returned successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Submission not found
 *       500:
 *         description: Server error
 */
router.get(
	"/submissions/:submissionId/detail",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { submissionId } = req.params;

			const submission = await prisma.formSubmission.findUnique({
				where: { id: submissionId },
				include: {
					student: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
							schoolId: true,
							year: true,
						},
					},
					formTemplate: {
						include: {
							fields: {
								orderBy: { sortOrder: "asc" },
							},
						},
					},
					answers: {
						include: {
							formField: true,
						},
					},
					reviewedBy: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			});

			if (!submission) {
				return res.status(404).json({
					message: "Submission not found",
				});
			}

			return res.json({ submission });
		} catch (e) {
			return res.status(500).json({
				message: "Server error",
				error: String(e),
			});
		}
	},
);

/**
 * @swagger
 * /admin/forms/submissions/{submissionId}/review:
 *   patch:
 *     summary: Review or grade a submission
 *     tags: [Admin Forms]
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Submission ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: graded
 *               grade:
 *                 type: string
 *                 nullable: true
 *                 example: A
 *               score:
 *                 type: number
 *                 nullable: true
 *                 example: 95
 *               feedback:
 *                 type: string
 *                 nullable: true
 *                 example: Great work. Please keep copies of all supporting documents.
 *     responses:
 *       200:
 *         description: Submission reviewed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Submission not found
 *       500:
 *         description: Server error
 */
router.patch(
	"/submissions/:submissionId/review",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { submissionId } = req.params;
			const { status, grade, score, feedback } = req.body;

			const existing = await prisma.formSubmission.findUnique({
				where: { id: submissionId },
			});

			if (!existing) {
				return res.status(404).json({
					message: "Submission not found",
				});
			}

			const allowedStatuses = [
				"draft",
				"submitted",
				"under_review",
				"graded",
				"returned",
			];

			if (status && !allowedStatuses.includes(status)) {
				return res.status(400).json({
					message: "Invalid submission status",
				});
			}

			const updated = await prisma.formSubmission.update({
				where: { id: submissionId },
				data: {
					status: status || existing.status,
					grade: grade ?? existing.grade,
					score: typeof score === "number" ? score : existing.score,
					feedback: feedback ?? existing.feedback,
					reviewedAt: new Date(),
					reviewedById: req.user.id,
				},
				include: {
					student: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			});

			return res.json({
				message: "Submission reviewed successfully",
				submission: updated,
			});
		} catch (e) {
			return res.status(500).json({
				message: "Server error",
				error: String(e),
			});
		}
	},
);

function extractCloudinaryPublicId(url) {
	if (!url || typeof url !== "string") return null;

	try {
		const parsedUrl = new URL(url);
		const parts = parsedUrl.pathname.split("/").filter(Boolean);
		const uploadIndex = parts.findIndex((part) => part === "upload");

		if (uploadIndex === -1) return null;

		let publicIdParts = parts.slice(uploadIndex + 1);

		if (publicIdParts[0] && /^v\d+$/.test(publicIdParts[0])) {
			publicIdParts = publicIdParts.slice(1);
		}

		if (publicIdParts.length === 0) return null;

		const lastPart = publicIdParts[publicIdParts.length - 1];
		publicIdParts[publicIdParts.length - 1] = lastPart.replace(/\.[^.]+$/, "");

		return publicIdParts.join("/");
	} catch {
		return null;
	}
}

/**
 * @swagger
 * /admin/forms/{id}:
 *   delete:
 *     summary: Delete a form template
 *     tags: [Admin Forms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Form template ID
 *     responses:
 *       200:
 *         description: Form deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Form not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const form = await prisma.formTemplate.findUnique({
			where: { id },
			include: {
				submissions: {
					include: {
						answers: true,
					},
				},
			},
		});

		if (!form) {
			return res.status(404).json({
				message: "Form not found",
			});
		}

		const signatureUrls = form.submissions.flatMap((submission) =>
			submission.answers
				.map((answer) => answer.valueSignatureUrl)
				.filter((url) => typeof url === "string" && url.trim().length > 0),
		);

		for (const url of signatureUrls) {
			const publicId = extractCloudinaryPublicId(url);
			if (!publicId) continue;

			try {
				await cloudinary.uploader.destroy(publicId, {
					resource_type: "image",
				});
			} catch (cloudinaryError) {
				console.error(
					`Failed to delete Cloudinary asset for form ${id}:`,
					cloudinaryError,
				);
			}
		}

		await prisma.formTemplate.delete({
			where: { id },
		});

		return res.json({
			message: "Form deleted successfully",
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
 * /admin/forms/submissions/{submissionId}:
 *   delete:
 *     summary: Delete a submission and any uploaded signature assets
 *     tags: [Admin Forms]
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Submission ID
 *     responses:
 *       200:
 *         description: Submission deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Submission not found
 *       500:
 *         description: Server error
 */
router.delete(
	"/submissions/:submissionId",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { submissionId } = req.params;

			const submission = await prisma.formSubmission.findUnique({
				where: { id: submissionId },
				include: {
					answers: true,
				},
			});

			if (!submission) {
				return res.status(404).json({
					message: "Submission not found",
				});
			}

			const signatureUrls = submission.answers
				.map((answer) => answer.valueSignatureUrl)
				.filter((url) => typeof url === "string" && url.trim().length > 0);

			for (const url of signatureUrls) {
				const publicId = extractCloudinaryPublicId(url);
				if (!publicId) continue;

				try {
					await cloudinary.uploader.destroy(publicId, {
						resource_type: "image",
					});
				} catch (cloudinaryError) {
					console.error(
						`Failed to delete Cloudinary asset for submission ${submissionId}:`,
						cloudinaryError,
					);
				}
			}

			await prisma.formSubmission.delete({
				where: { id: submissionId },
			});

			return res.json({
				message: "Submission deleted successfully",
			});
		} catch (e) {
			return res.status(500).json({
				message: "Server error",
				error: String(e),
			});
		}
	},
);

module.exports = router;
