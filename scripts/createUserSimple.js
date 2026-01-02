// Simple script to create a user via API
// Run with: node scripts/createUserSimple.js

const createUser = async () => {
  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');

  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://dulsara:dulsara123@timetable.oimentz.mongodb.net/?appName=timetable');
    console.log('✅ Connected to MongoDB');

    // Define User schema
    const UserSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      name: { type: String, required: true },
      schoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
      createdAt: { type: Date, default: Date.now },
    });

    const User = mongoose.models.User || mongoose.model('User', UserSchema);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Create user
    const user = await User.create({
      email: 'admin@eduflow.ai',
      password: hashedPassword,
      name: 'Admin User',
      schoolId: null,
    });

    console.log('✅ User created successfully!');
    console.log('📧 Email: admin@eduflow.ai');
    console.log('🔑 Password: admin123');
    console.log('🆔 User ID:', user._id.toString());

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    if (error.code === 11000) {
      console.log('ℹ️  User already exists!');
      console.log('📧 Email: admin@eduflow.ai');
      console.log('🔑 Password: admin123');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
};

createUser();
