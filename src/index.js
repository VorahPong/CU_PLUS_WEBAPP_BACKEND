const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
app.use(
	cors({
		origin: "http://localhost:3000", // change to your Flutter web origin
		credentials: true,
	}),
);

app.use(express.json());
app.use(cookieParser());

// health check (keep this)
app.get("/health", (req, res) => {
	res.json({ ok: true, message: "backend is running" });
});

// feature routes
const authRoutes = require("./features/auth/auth.routes");
const adminStudentsRoutes = require("./features/admin/admin.students.routes");

app.use("/auth", authRoutes);
app.use("/admin/students", adminStudentsRoutes);

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
