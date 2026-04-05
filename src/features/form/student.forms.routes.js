const express = require("express");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

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
				OR: [{ year: null }, { year: user.year }],
			},
			orderBy: { createdAt: "desc" },
			include: {
				fields: {
					orderBy: { sortOrder: "asc" },
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
				OR: [{ year: null }, { year: user.year }],
			},
			include: {
				fields: {
					orderBy: { sortOrder: "asc" },
				},
			},
		});

		if (!form) {
			return res.status(404).json({
				message: "Form not found or not available to this student",
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

		const fieldMap = new Map(form.fields.map((f) => [f.id, f]));

		for (const answer of answers) {
			const field = fieldMap.get(answer.formFieldId);

			if (!field) {
				return res.status(400).json({
					message: `Invalid field id: ${answer.formFieldId}`,
				});
			}
		}

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

module.exports = router;
