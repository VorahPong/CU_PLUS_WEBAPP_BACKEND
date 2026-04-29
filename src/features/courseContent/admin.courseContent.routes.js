const express = require("express");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const router = express.Router();

function sortTreeItems(items) {
	items.sort((a, b) => a.sortOrder - b.sortOrder);
}

function buildCourseContentTree(folders, forms) {
	const folderMap = new Map();
	const roots = [];
	const rootForms = [];

	for (const folder of folders) {
		folderMap.set(folder.id, {
			...folder,
			children: [],
			forms: [],
		});
	}

	for (const folder of folders) {
		const node = folderMap.get(folder.id);

		if (folder.parentId && folderMap.has(folder.parentId)) {
			folderMap.get(folder.parentId).children.push(node);
		} else {
			roots.push(node);
		}
	}

	for (const form of forms) {
		if (form.folderId && folderMap.has(form.folderId)) {
			folderMap.get(form.folderId).forms.push(form);
		} else {
			rootForms.push(form);
		}
	}

	const sortRecursive = (items) => {
		sortTreeItems(items);

		for (const item of items) {
			sortTreeItems(item.children);
			sortTreeItems(item.forms);
			sortRecursive(item.children);
		}
	};

	sortRecursive(roots);
	sortTreeItems(rootForms);

	return {
		folders: roots,
		rootForms,
	};
}

/**
 * @swagger
 * /course-content/tree:
 *   get:
 *     summary: Get full course content tree with nested folders and forms
 *     tags: [Course Content]
 *     responses:
 *       200:
 *         description: Course content tree returned successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/tree", requireAuth, async (req, res) => {
	try {
		const isAdmin = req.user?.role === "admin";
		const user = isAdmin
			? null
			: await prisma.user.findUnique({
					where: { id: req.user.id },
					select: {
						id: true,
						year: true,
					},
				});

		const [folders, forms] = await Promise.all([
			prisma.courseFolder.findMany({
				orderBy: { sortOrder: "asc" },
			}),
			prisma.formTemplate.findMany({
				where: isAdmin ? {} : { isActive: true },
				orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
				include: {
					...(isAdmin
						? {
								submissions: {
									where: {
										status: {
											in: ["submitted", "graded"],
										},
									},
									select: {
										id: true,
									},
								},
							}
						: {
								submissions: {
									where: {
										studentId: req.user.id,
									},
									select: {
										id: true,
										status: true,
										submittedAt: true,
									},
									take: 1,
								},
							}),
				},
			}),
		]);

		const normalizedForms = forms.map((form) => {
			if (isAdmin) {
				return {
					...form,
					_count: {
						submissions: form.submissions?.length ?? 0,
					},
				};
			}

			const submission = form.submissions?.[0] ?? null;
			const isAvailableToStudent = !form.year || form.year === user?.year;

			return {
				...form,
				submission,
				isSubmitted:
					submission?.status === "submitted" ||
					submission?.status === "graded",
				isAvailableToStudent,
				isLocked: !isAvailableToStudent,
				lockedReason: isAvailableToStudent
					? null
					: `Only available to ${form.year} year students`,
			};
		});

		const tree = buildCourseContentTree(folders, normalizedForms);

		return res.json(tree);
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /course-content/admin/folders:
 *   post:
 *     summary: Create a new root folder
 *     tags: [Course Content]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Folder created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post("/admin/folders", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { title, sortOrder } = req.body;

		if (!title || !title.trim()) {
			return res.status(400).json({
				message: "Folder title is required",
			});
		}

		const folder = await prisma.courseFolder.create({
			data: {
				title: title.trim(),
				parentId: null,
				sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
				createdById: req.user.id,
			},
		});

		return res.status(201).json({
			message: "Folder created successfully",
			folder,
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
 * /course-content/admin/folders/{id}/subfolders:
 *   post:
 *     summary: Create a subfolder inside a folder
 *     tags: [Course Content]
 */
router.post(
	"/admin/folders/:id/subfolders",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { id } = req.params;
			const { title, sortOrder } = req.body;

			if (!title || !title.trim()) {
				return res.status(400).json({
					message: "Subfolder title is required",
				});
			}

			const parent = await prisma.courseFolder.findUnique({
				where: { id },
			});

			if (!parent) {
				return res.status(404).json({
					message: "Parent folder not found",
				});
			}

			const folder = await prisma.courseFolder.create({
				data: {
					title: title.trim(),
					parentId: id,
					sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
					createdById: req.user.id,
				},
			});

			return res.status(201).json({
				message: "Subfolder created successfully",
				folder,
			});
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
 * /course-content/admin/folders/{id}:
 *   patch:
 *     summary: Rename or reorder a folder
 *     tags: [Course Content]
 */
router.patch(
	"/admin/folders/:id",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { id } = req.params;
			const { title, sortOrder } = req.body;

			const existing = await prisma.courseFolder.findUnique({
				where: { id },
			});

			if (!existing) {
				return res.status(404).json({
					message: "Folder not found",
				});
			}

			if (title != null && !title.toString().trim()) {
				return res.status(400).json({
					message: "Folder title cannot be empty",
				});
			}

			const updated = await prisma.courseFolder.update({
				where: { id },
				data: {
					title: title != null ? title.toString().trim() : existing.title,
					sortOrder:
						typeof sortOrder === "number" ? sortOrder : existing.sortOrder,
				},
			});

			return res.json({
				message: "Folder updated successfully",
				folder: updated,
			});
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
 * /course-content/admin/folders/{id}/move:
 *   patch:
 *     summary: Move folder under another parent
 *     tags: [Course Content]
 */
router.patch(
	"/admin/folders/:id/move",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { id } = req.params;
			const { parentId, sortOrder } = req.body;

			const folder = await prisma.courseFolder.findUnique({
				where: { id },
			});

			if (!folder) {
				return res.status(404).json({
					message: "Folder not found",
				});
			}

			if (parentId === id) {
				return res.status(400).json({
					message: "A folder cannot be its own parent",
				});
			}

			if (parentId) {
				const parent = await prisma.courseFolder.findUnique({
					where: { id: parentId },
				});

				if (!parent) {
					return res.status(404).json({
						message: "Target parent folder not found",
					});
				}
			}

			const updated = await prisma.courseFolder.update({
				where: { id },
				data: {
					parentId: parentId ?? null,
					sortOrder:
						typeof sortOrder === "number" ? sortOrder : folder.sortOrder,
				},
			});

			return res.json({
				message: "Folder moved successfully",
				folder: updated,
			});
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
 * /course-content/admin/folders/{id}:
 *   delete:
 *     summary: Delete an empty folder
 *     tags: [Course Content]
 */
router.delete(
	"/admin/folders/:id",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { id } = req.params;

			const existing = await prisma.courseFolder.findUnique({
				where: { id },
			});

			if (!existing) {
				return res.status(404).json({
					message: "Folder not found",
				});
			}
			const childFolderCount = await prisma.courseFolder.count({
				where: { parentId: id },
			});

			const formCount = await prisma.formTemplate.count({
				where: { folderId: id },
			});

			if (childFolderCount > 0 || formCount > 0) {
				return res.status(400).json({
					message:
						"Folder must be empty before it can be deleted. Move or delete its subfolders and forms first.",
				});
			}

			await prisma.courseFolder.delete({
				where: { id },
			});

			return res.json({
				message: "Folder deleted successfully",
			});
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
 * /course-content/admin/forms/{formId}/move:
 *   patch:
 *     summary: Move a form to another folder or to root
 *     tags: [Course Content]
 */
router.patch(
	"/admin/forms/:formId/move",
	requireAuth,
	requireAdmin,
	async (req, res) => {
		try {
			const { formId } = req.params;
			const { folderId, sortOrder } = req.body;

			const form = await prisma.formTemplate.findUnique({
				where: { id: formId },
			});

			if (!form) {
				return res.status(404).json({
					message: "Form not found",
				});
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

			const updated = await prisma.formTemplate.update({
				where: { id: formId },
				data: {
					folderId: folderId || null,
					sortOrder: typeof sortOrder === "number" ? sortOrder : form.sortOrder,
				},
				include: {
					folder: true,
					_count: {
						select: {
							submissions: true,
						},
					},
				},
			});

			return res.json({
				message: "Form moved successfully",
				form: updated,
			});
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
 * /course-content/admin/reorder:
 *   patch:
 *     summary: Reorder mixed root-level or folder-level content
 *     tags: [Course Content]
 */
router.patch("/admin/reorder", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { parentFolderId = null, items } = req.body;

		if (!Array.isArray(items) || items.length === 0) {
			return res.status(400).json({
				message: "items array is required",
			});
		}

		if (parentFolderId) {
			const parent = await prisma.courseFolder.findUnique({
				where: { id: parentFolderId },
			});

			if (!parent) {
				return res.status(404).json({
					message: "Parent folder not found",
				});
			}
		}

		await prisma.$transaction(async (tx) => {
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const type = item?.type;
				const id = item?.id;
				const sortOrder =
					typeof item?.sortOrder === "number" ? item.sortOrder : i;

				if (!id || (type !== "folder" && type !== "form")) {
					throw new Error("Invalid reorder payload");
				}

				if (type === "folder") {
					await tx.courseFolder.update({
						where: { id },
						data: {
							parentId: parentFolderId,
							sortOrder,
						},
					});
					continue;
				}

				await tx.formTemplate.update({
					where: { id },
					data: {
						folderId: parentFolderId,
						sortOrder,
					},
				});
			}
		});

		return res.json({
			message: "Course content reordered successfully",
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

module.exports = router;
