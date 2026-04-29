const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin Students
 *   description: Admin student management endpoints
 */
// POST /admin/students
/**
 * @swagger
 * /admin/students:
 *   post:
 *     summary: Create a student account
 *     tags: [Admin Students]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - schoolId
 *               - year
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Vorahpong
 *               lastName:
 *                 type: string
 *                 example: Mean
 *               email:
 *                 type: string
 *                 example: student@cameron.edu
 *               password:
 *                 type: string
 *                 example: Secret123!
 *               schoolId:
 *                 type: string
 *                 example: 900123456
 *               year:
 *                 type: string
 *                 example: "2"
 *     responses:
 *       201:
 *         description: Student created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Email or school ID already exists
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /admin/students:
 *   get:
 *     summary: Get students with optional search and filters
 *     tags: [Admin Students]
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Search by school ID, email, first name, or last name
 *       - in: query
 *         name: year
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by student year (1, 2, 3, or 4)
 *       - in: query
 *         name: isActive
 *         required: false
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Students returned successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
// GET /admin/students
router.get("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { search, year, isActive } = req.query;

		const where = {
			role: "student",
		};

		if (typeof year === "string" && year.trim()) {
			where.year = year.trim();
		}

		if (typeof isActive === "string" && isActive.trim()) {
			where.isActive = isActive === "true";
		}

		if (typeof search === "string" && search.trim()) {
			const query = search.trim();
			const terms = query.split(/\s+/).filter(Boolean);

			where.AND = [
				{
					OR: [
						{ schoolId: { contains: query, mode: "insensitive" } },
						{ email: { contains: query, mode: "insensitive" } },
						{ firstName: { contains: query, mode: "insensitive" } },
						{ lastName: { contains: query, mode: "insensitive" } },
					],
				},
			];

			if (terms.length >= 2) {
				where.AND.push({
					OR: [
						{
							AND: [
								{
									firstName: {
										contains: terms[0],
										mode: "insensitive",
									},
								},
								{
									lastName: {
										contains: terms.slice(1).join(" "),
										mode: "insensitive",
									},
								},
							],
						},
						{
							AND: [
								{
									firstName: {
										contains: terms.slice(1).join(" "),
										mode: "insensitive",
									},
								},
								{
									lastName: {
										contains: terms[0],
										mode: "insensitive",
									},
								},
							],
						},
					],
				});
			}
		}

		const students = await prisma.user.findMany({
			where,
			orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
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

/**
 * @swagger
 * /admin/students/{id}:
 *   delete:
 *     summary: Deactivate a student account
 *     tags: [Admin Students]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student user ID
 *     responses:
 *       200:
 *         description: Student deactivated successfully
 *       400:
 *         description: Only student accounts can be deactivated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /admin/students/{id}/reactivate:
 *   patch:
 *     summary: Reactivate a student account
 *     tags: [Admin Students]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student user ID
 *     responses:
 *       200:
 *         description: Student reactivated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /admin/students/{id}:
 *   get:
 *     summary: Get a student by ID
 *     tags: [Admin Students]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student user ID
 *     responses:
 *       200:
 *         description: Student returned successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Student not found
 *       500:
 *         description: Server error
 */
router.get("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const student = await prisma.user.findFirst({
			where: {
				id,
				role: "student",
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
				profileImageUrl: true,
			},
		});

		if (!student) {
			return res.status(404).json({
				message: "Student not found",
			});
		}

		return res.json({ student });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /admin/students/{id}:
 *   patch:
 *     summary: Update a student
 *     tags: [Admin Students]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Student user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Vorahpong
 *               lastName:
 *                 type: string
 *                 example: Mean
 *               name:
 *                 type: string
 *                 nullable: true
 *                 example: Pong
 *               email:
 *                 type: string
 *                 example: student@cameron.edu
 *               schoolId:
 *                 type: string
 *                 example: 900123456
 *               year:
 *                 type: string
 *                 nullable: true
 *                 example: "2"
 *               isActive:
 *                 type: boolean
 *                 nullable: true
 *                 example: true
 *     responses:
 *       200:
 *         description: Student updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Student not found
 *       409:
 *         description: Email or school ID already exists
 *       500:
 *         description: Server error
 */
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;
		const { firstName, lastName, name, email, schoolId, year, isActive } =
			req.body;

		const existing = await prisma.user.findFirst({
			where: {
				id,
				role: "student",
			},
		});

		if (!existing) {
			return res.status(404).json({
				message: "Student not found",
			});
		}

		if (firstName != null && !firstName.toString().trim()) {
			return res.status(400).json({ message: "First name cannot be empty" });
		}

		if (lastName != null && !lastName.toString().trim()) {
			return res.status(400).json({ message: "Last name cannot be empty" });
		}

		if (email != null && !email.toString().trim()) {
			return res.status(400).json({ message: "Email cannot be empty" });
		}

		if (schoolId != null && !schoolId.toString().trim()) {
			return res.status(400).json({ message: "School ID cannot be empty" });
		}

		if (year !== undefined && !["1", "2", "3", "4"].includes(String(year))) {
			return res.status(400).json({
				message: "year must be 1, 2, 3, or 4",
			});
		}

		if (isActive !== undefined && typeof isActive !== "boolean") {
			return res.status(400).json({
				message: "isActive must be a boolean",
			});
		}

		const nextEmail = email != null ? email.toString().trim() : existing.email;
		const nextSchoolId =
			schoolId != null ? schoolId.toString().trim() : existing.schoolId;

		const emailTaken = await prisma.user.findFirst({
			where: {
				email: nextEmail,
				NOT: { id },
			},
			select: { id: true },
		});

		if (emailTaken) {
			return res.status(409).json({
				message: "Email already exists",
			});
		}

		const schoolIdTaken = await prisma.user.findFirst({
			where: {
				schoolId: nextSchoolId,
				NOT: { id },
			},
			select: { id: true },
		});

		if (schoolIdTaken) {
			return res.status(409).json({
				message: "School ID already exists",
			});
		}

		const updatedStudent = await prisma.user.update({
			where: { id },
			data: {
				firstName:
					firstName != null ? firstName.toString().trim() : existing.firstName,
				lastName:
					lastName != null ? lastName.toString().trim() : existing.lastName,
				name: name != null ? name.toString().trim() || null : existing.name,
				email: nextEmail,
				schoolId: nextSchoolId,
				year: year !== undefined ? String(year) : existing.year,
				isActive: typeof isActive === "boolean" ? isActive : existing.isActive,
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
				profileImageUrl: true,
			},
		});

		return res.json({
			message: "Student updated successfully",
			student: updatedStudent,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

module.exports = router;
