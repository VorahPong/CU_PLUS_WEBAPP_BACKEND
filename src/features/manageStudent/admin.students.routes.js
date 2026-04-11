const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// POST /admin/students
router.post("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { firstName, lastName, email, password, schoolId, year } = req.body;

		if (!firstName || !lastName || !email || !password || !schoolId || !year) {
			return res.status(400).json({
				message:
					"firstName, lastName, email, password, schoolId, and year are required",
			});
		}

		const existingEmail = await prisma.user.findUnique({
			where: { email },
		});

		if (existingEmail) {
			return res.status(409).json({ message: "Email already exists" });
		}

		const existingSchoolId = await prisma.user.findUnique({
			where: { schoolId },
		});

		if (existingSchoolId) {
			return res.status(409).json({ message: "School ID already exists" });
		}

		const hashedPassword = await bcrypt.hash(password, 10);

		const createdStudent = await prisma.user.create({
			data: {
				firstName,
				lastName,
				name: `${firstName} ${lastName}`,
				email,
				password: hashedPassword,
				schoolId,
				year,
				role: "student",
				isActive: true,
			},
			select: {
				id: true,
				firstName: true,
				lastName: true,
				name: true,
				email: true,
				schoolId: true,
				year: true,
				role: true,
				isActive: true,
				createdAt: true,
			},
		});

		return res.status(201).json({
			message: "Student created successfully",
			user: createdStudent,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

// GET /admin/students
router.get("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const students = await prisma.user.findMany({
			where: {
				role: "student",
				// isActive: true,
			},
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				name: true,
				email: true,
				schoolId: true,
				year: true,
				role: true,
				isActive: true,
				createdAt: true,
			},
		});

		return res.json({ students });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

// DELETE /admin/students/:id
// soft delete -> deactivate account
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const existing = await prisma.user.findUnique({ where: { id } });
		if (!existing) {
			return res.status(404).json({ message: "Student not found" });
		}

		if (existing.role !== "student") {
			return res
				.status(400)
				.json({ message: "Only student accounts can be deactivated" });
		}

		await prisma.user.update({
			where: { id },
			data: { isActive: false },
		});

		return res.json({ message: "Student deactivated successfully" });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

// PATCH /admin/students/:id/reactivate
router.patch("/:id/reactivate", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const existing = await prisma.user.findUnique({ where: { id } });
		if (!existing) {
			return res.status(404).json({ message: "Student not found" });
		}

		await prisma.user.update({
			where: { id },
			data: { isActive: true },
		});

		return res.json({ message: "Student reactivated successfully" });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

module.exports = router;
