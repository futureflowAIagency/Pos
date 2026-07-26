/**
 * Seed script: creates a superadmin, a demo shop owner + business,
 * and some sample products/customers/employees.
 * Run: npm run seed
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Business from '../models/Business.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import Supplier from '../models/Supplier.js';
import PhoneUnit from '../models/PhoneUnit.js';

const run = async () => {
  await connectDB();
  console.log('🌱 Seeding...');

  await Promise.all([
    User.deleteMany({}), Business.deleteMany({}),
    Product.deleteMany({}), Customer.deleteMany({}), Employee.deleteMany({}),
    Supplier.deleteMany({}), PhoneUnit.deleteMany({}),
  ]);

  // Superadmin (platform owner)
  await User.create({
    name: 'Super Admin',
    email: 'admin@futureflow.ai',
    password: 'admin123',
    role: 'superadmin',
  });

  // Demo shop owner + business
  const owner = await User.create({
    name: 'Demo Owner',
    email: 'owner@demo.com',
    password: 'owner123',
    role: 'owner',
  });
  const business = await Business.create({
    name: 'Demo Pharmacy & Store',
    type: 'pharmacy',
    owner: owner._id,
    phone: '017XXXXXXXX',
    address: 'Bogura, Bangladesh',
    email: 'demo.pharmacy@example.com',
    subscriptionStatus: 'active',
    subscriptionExpiry: new Date(Date.now() + 30 * 864e5),
  });
  owner.business = business._id;
  await owner.save();

  await Product.insertMany([
    { business: business._id, name: 'Napa 500mg', category: 'Medicine', purchasePrice: 0.8, sellingPrice: 1, discountPercent: 10, stock: 200, lowStockAlert: 50, unit: 'pcs', expiryDate: new Date(Date.now() + 200 * 864e5), batchNo: 'B-2026A' },
    { business: business._id, name: 'Seclo 20mg', category: 'Medicine', purchasePrice: 5, sellingPrice: 7, stock: 40, lowStockAlert: 30, unit: 'pcs', expiryDate: new Date(Date.now() + 20 * 864e5), batchNo: 'B-2026B' },
    { business: business._id, name: 'Hand Sanitizer', category: 'General', purchasePrice: 60, sellingPrice: 90, stock: 12, lowStockAlert: 10 },
    { business: business._id, name: 'Saline IV', category: 'Medicine', purchasePrice: 70, sellingPrice: 100, stock: 5, lowStockAlert: 10, expiryDate: new Date(Date.now() - 5 * 864e5), batchNo: 'B-2025X' },
  ]);

  await Customer.insertMany([
    { business: business._id, name: 'Rahim Uddin', phone: '01710000001', totalDue: 350 },
    { business: business._id, name: 'Karim Mia', phone: '01710000002', totalDue: 0 },
  ]);

  await Employee.insertMany([
    { business: business._id, employeeId: 'EMP-0001', name: 'Jamal Hossain', designation: 'Salesman', department: 'Sales', monthlySalary: 12000, phone: '01710000010', email: 'jamal@demo.com', gender: 'male', joinDate: new Date('2025-01-15'), isActive: true },
    { business: business._id, employeeId: 'EMP-0002', name: 'Nadia Akter', designation: 'Cashier', department: 'Front Desk', monthlySalary: 14000, phone: '01710000011', gender: 'female', joinDate: new Date('2025-06-01'), isActive: true },
    { business: business._id, employeeId: 'EMP-0003', name: 'Sohel Rana', designation: 'Helper', monthlySalary: 9000, phone: '01710000012', gender: 'male', joinDate: new Date('2024-11-20'), isActive: false },
  ]);

  await Supplier.create({
    business: business._id, name: 'MediSupply Ltd', phone: '01810000001',
    address: 'Dhaka', totalPurchase: 5000, totalPaid: 3000,
  });

  // ---- Demo Mobile Shop (Business Type = Technology Management System) ----
  const mobileOwner = await User.create({
    name: 'Mobile Owner', email: 'mobile@demo.com', password: 'owner123', role: 'owner',
  });
  const mobileBiz = await Business.create({
    name: 'Demo Mobile Gallery', type: 'mobile', owner: mobileOwner._id,
    phone: '018XXXXXXXX', address: 'Gulshan, Dhaka', email: 'mobile@example.com',
    subscriptionStatus: 'active', subscriptionExpiry: new Date(Date.now() + 30 * 864e5),
  });
  mobileOwner.business = mobileBiz._id;
  await mobileOwner.save();

  const iphone = await Product.create({
    business: mobileBiz._id, name: 'iPhone 15 Pro', category: 'Mobile', brand: 'Apple',
    storage: '128GB', color: 'Black', trackSerial: true, purchasePrice: 140000, sellingPrice: 165000,
    warrantyBrandMonths: 12, warrantyShopMonths: 3, unit: 'pcs', lowStockAlert: 2,
  });
  await Product.create({
    business: mobileBiz._id, name: 'USB-C Cable', category: 'Accessory', purchasePrice: 200,
    sellingPrice: 350, stock: 50, lowStockAlert: 10, unit: 'pcs',
  });
  await PhoneUnit.insertMany([
    { business: mobileBiz._id, product: iphone._id, imei1: '356789012345671', imei2: '356789012345672', status: 'in_stock' },
    { business: mobileBiz._id, product: iphone._id, imei1: '356789012345681', imei2: '356789012345682', status: 'in_stock' },
    { business: mobileBiz._id, product: iphone._id, imei1: '356789012345691', status: 'in_stock' },
  ]);
  iphone.stock = 3;
  await iphone.save();

  console.log('✅ Seed complete!');
  console.log('   Superadmin   -> admin@futureflow.ai / admin123');
  console.log('   Pharmacy     -> owner@demo.com / owner123');
  console.log('   Mobile Shop  -> mobile@demo.com / owner123');
  await mongoose.connection.close();
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
