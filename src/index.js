const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// health check (keep this)
app.get("/health", (req, res) => {
	res.json({ ok: true, message: "backend is running" });
});

// feature routes
const authRoutes = require("./features/auth/auth.routes");
const adminStudentsRoutes = require("./features/students/admin.students.routes");

app.use("/auth", authRoutes);
app.use("/admin/students", adminStudentsRoutes);

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
