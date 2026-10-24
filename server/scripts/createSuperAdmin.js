const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

mongoose.connect("ac-l91pjcm-shard-00-02.ead0pec.mongodb.net");

const createSuperAdmin = async () => {
  const email = "abcd@abc.com";
  const password = "1234";

  const exists = await User.findOne({ email });
  if (exists) {
    console.log("Super Admin already exists");
    process.exit();
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    name: "Super Admin",
    email,
    password: hashedPassword,
    role: "superadmin",
    isActive: true,
  });

  console.log("✅ Super Admin created successfully");
  process.exit();
};

createSuperAdmin();
