const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../../prisma");

const router = express.Router();

router.post("/login", async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password)
			return res.status(400).json({ message: "email and password required" });

		const user = await prisma.user.findUnique({ where: { email } });
		if (!user) return res.status(401).json({ message: "invalid credentials" });

		const ok = await bcrypt.compare(password, user.password);
		if (!ok) return res.status(401).json({ message: "invalid credentials" });

		const token = jwt.sign(
			{ sub: user.id, email: user.email, role: user.role },
			process.env.JWT_SECRET || "dev_secret_change_me",
			{ expiresIn: "15m" }
		);

		res.json({
			token,
			user: {
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				name: user.name,
				schoolId: user.schoolId,
				year: user.year,
				role: user.role,
			},
		});
	} catch (e) {
		res.status(500).json({ message: "server error", error: String(e) });
	}
});

module.exports = router;
