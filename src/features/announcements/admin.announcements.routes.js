const express = require("express");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// POST /admin/announcements
router.post("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const {
			message,
			everyone,
			firstYear,
			secondYear,
			thirdYear,
			fourthYear,
		} = req.body;

		if (!message || !message.trim()) {
			return res.status(400).json({
				message: "message is required",
			});
		}

		const hasAudience =
			everyone || firstYear || secondYear || thirdYear || fourthYear;

		if (!hasAudience) {
			return res.status(400).json({
				message: "At least one audience must be selected",
			});
		}

		const createdAnnouncement = await prisma.announcement.create({
			data: {
				message: message.trim(),
				everyone: Boolean(everyone),
				firstYear: Boolean(firstYear),
				secondYear: Boolean(secondYear),
				thirdYear: Boolean(thirdYear),
				fourthYear: Boolean(fourthYear),
				authorId: req.user.id,
			},
			include: {
				author: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
		});

		return res.status(201).json({
			message: "Announcement created successfully",
			announcement: createdAnnouncement,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

// GET /admin/announcements
router.get("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const announcements = await prisma.announcement.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				author: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
		});

		return res.json({ announcements });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

// DELETE /admin/announcements/:id
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const existing = await prisma.announcement.findUnique({
			where: { id },
		});

		if (!existing) {
			return res.status(404).json({
				message: "Announcement not found",
			});
		}

		await prisma.announcement.delete({
			where: { id },
		});

		return res.json({
			message: "Announcement deleted successfully",
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

// PUT /admin/announcements/:id
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;
		const {
			message,
			everyone,
			firstYear,
			secondYear,
			thirdYear,
			fourthYear,
		} = req.body;

		const existing = await prisma.announcement.findUnique({
			where: { id },
		});

		if (!existing) {
			return res.status(404).json({
				message: "Announcement not found",
			});
		}

		if (!message || !message.trim()) {
			return res.status(400).json({
				message: "message is required",
			});
		}

		const hasAudience =
			everyone || firstYear || secondYear || thirdYear || fourthYear;

		if (!hasAudience) {
			return res.status(400).json({
				message: "At least one audience must be selected",
			});
		}

		const updatedAnnouncement = await prisma.announcement.update({
			where: { id },
			data: {
				message: message.trim(),
				everyone: Boolean(everyone),
				firstYear: Boolean(firstYear),
				secondYear: Boolean(secondYear),
				thirdYear: Boolean(thirdYear),
				fourthYear: Boolean(fourthYear),
			},
			include: {
				author: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
		});

		return res.json({
			message: "Announcement updated successfully",
			announcement: updatedAnnouncement,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

module.exports = router;