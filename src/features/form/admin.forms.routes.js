const express = require("express");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const router = express.Router();

/**
 * POST /admin/forms
 * Create a new form template with fields
 */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { title, description, year, dueDate, instructions, fields } =
			req.body;

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

		const createdForm = await prisma.formTemplate.create({
			data: {
				title: title.trim(),
				description: description?.trim() || null,
				year: year || null,
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
 * GET /admin/forms
 * Fetch all form templates
 */
router.get("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const forms = await prisma.formTemplate.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				createdBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
					},
				},
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
 * GET /admin/forms/:id
 * Fetch one form template
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
 * PUT /admin/forms/:id
 * Update form template + replace fields
 */
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;
		const {
			title,
			description,
			year,
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
 * GET /admin/forms/:id/submissions
 * Fetch submissions for one form
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
 * GET /admin/submissions/:id
 * Fetch full submission with answers
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
 * PATCH /admin/submissions/:id/review
 * Review / grade a submission
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

module.exports = router;
