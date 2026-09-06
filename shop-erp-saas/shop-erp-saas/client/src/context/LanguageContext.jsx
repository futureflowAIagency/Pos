import { createContext, useContext, useEffect, useState } from 'react';

const LanguageContext = createContext();
export const useLang = () => useContext(LanguageContext);

/*
 * English -> Bangla dictionary for the whole app.
 * The provider runs a DOM translator that swaps any visible English text
 * (and placeholder/title attributes) that exactly matches a key below.
 * Anything not listed here simply stays in English, so adding coverage
 * later is just a matter of adding more keys.
 */
const bn = {
  // ---- Nav / topbar ----
  'Shop ERP': 'শপ ইআরপি', Workspace: 'ওয়ার্কস্পেস', Dashboard: 'ড্যাশবোর্ড',
  Products: 'পণ্য', 'POS / Sales': 'পিওএস / বিক্রয়', Customers: 'গ্রাহক',
  Suppliers: 'সরবরাহকারী', Employees: 'কর্মচারী', Finance: 'অর্থ',
  Marketing: 'মার্কেটিং', CRM: 'সিআরএম', Subscription: 'সাবস্ক্রিপশন',
  'Activity Logs': 'কার্যকলাপ লগ', Settings: 'সেটিংস',
  'EMI / Installments': 'ইএমআই / কিস্তি', 'Service / Repair': 'সার্ভিস / মেরামত',
  'Admin Panel': 'অ্যাডমিন প্যানেল', Notifications: 'নোটিফিকেশন',
  Branches: 'ব্রাঞ্চ', 'All Branches': 'সব ব্রাঞ্চ', 'Stock Transfer': 'স্টক ট্রান্সফার',
  'Check Warranty': 'ওয়ারেন্টি চেক', 'Claim Warranty': 'ওয়ারেন্টি ক্লেইম',
  'Returns & Exchange': 'রিটার্ন ও এক্সচেঞ্জ', 'New Return / Exchange': 'নতুন রিটার্ন / এক্সচেঞ্জ',
  'Toggle theme': 'থিম পরিবর্তন', 'Toggle language': 'ভাষা পরিবর্তন', Logout: 'লগ আউট',
  'Mark all as read': 'সব পঠিত হিসেবে চিহ্নিত করুন', 'No notifications': 'কোনো নোটিফিকেশন নেই',
  'Relaunch to update': 'আপডেট করতে রিলঞ্চ করুন', 'A new version has been deployed — click to reload': 'নতুন একটা ভার্সন চালু হয়েছে — রিলোড করতে ক্লিক করুন',

  // ---- Stat cards / summary ----
  'Month Revenue': 'মাসিক আয়', 'Net Profit': 'নিট লাভ', "Today's Sales": 'আজকের বিক্রয়',
  'Total Due': 'মোট বাকি', 'Low Stock': 'কম স্টক', 'Month Orders': 'মাসিক অর্ডার',
  'Gross Profit': 'গ্রস লাভ', 'Total Expense': 'মোট খরচ', Total: 'মোট', Subtotal: 'উপমোট',
  Paid: 'পরিশোধিত', Due: 'বাকি', 'Pending Payments': 'বকেয়া পেমেন্ট',
  'Active Subscriptions': 'সক্রিয় সাবস্ক্রিপশন', Owners: 'মালিক', Businesses: 'ব্যবসা',
  'Account Created': 'অ্যাকাউন্ট তৈরি', Expenses: 'খরচ', Month: 'মাস',

  // ---- Dashboard sections ----
  'AI Business Summary': 'এআই ব্যবসা সারসংক্ষেপ', 'Generate summary': 'সারসংক্ষেপ তৈরি করুন',
  Regenerate: 'পুনরায় তৈরি', 'Analyzing…': 'বিশ্লেষণ করা হচ্ছে…',
  'Top Selling Products': 'শীর্ষ বিক্রিত পণ্য', 'Recent Orders': 'সাম্প্রতিক অর্ডার',
  'Low Stock Alert': 'কম স্টক সতর্কতা', 'Recent Activities': 'সাম্প্রতিক কার্যকলাপ',
  'No recent activity': 'সাম্প্রতিক কোনো কার্যকলাপ নেই', 'No sales this month': 'এই মাসে কোনো বিক্রয় নেই',
  'All stocked up ✅': 'সব স্টকে আছে ✅',

  // ---- Common buttons / actions ----
  Add: 'যোগ করুন', 'Add All': 'সব যোগ করুন', 'Add Customer': 'গ্রাহক যোগ করুন',
  'Add Expense': 'খরচ যোগ করুন', Cancel: 'বাতিল', Save: 'সংরক্ষণ', Close: 'বন্ধ করুন',
  Edit: 'সম্পাদনা', Delete: 'মুছুন', 'Print Report': 'রিপোর্ট প্রিন্ট', Approve: 'অনুমোদন',
  Reject: 'প্রত্যাখ্যান', Collect: 'আদায়', 'Collect due': 'বাকি আদায়', 'Pay due': 'বাকি পরিশোধ',
  'Pay salary': 'বেতন পরিশোধ', 'Record purchase': 'ক্রয় রেকর্ড', 'Record Payment': 'পেমেন্ট রেকর্ড',
  Record: 'রেকর্ড', Resume: 'পুনরায় শুরু', Send: 'পাঠান', 'Send test': 'টেস্ট পাঠান',
  'View profile': 'প্রোফাইল দেখুন', 'View / Pay': 'দেখুন / পরিশোধ', 'Mark Paid': 'পরিশোধিত চিহ্নিত',
  'Complete Sale': 'বিক্রয় সম্পন্ন', 'Create Plan': 'প্ল্যান তৈরি',
  'Create Owner Account': 'মালিক অ্যাকাউন্ট তৈরি', 'New Campaign': 'নতুন ক্যাম্পেইন',
  'New EMI Plan': 'নতুন ইএমআই প্ল্যান', 'Save Purchase': 'ক্রয় সংরক্ষণ',
  'Manage IMEIs': 'আইএমইআই ব্যবস্থাপনা', History: 'ইতিহাস', Ledger: 'খতিয়ান',
  'Held Bills': 'হোল্ড করা বিল', Invoice: 'ইনভয়েস', 'Print invoice': 'ইনভয়েস প্রিন্ট',
  'Print purchase report': 'ক্রয় রিপোর্ট প্রিন্ট', 'Purchase Report': 'ক্রয় রিপোর্ট',
  'Sales Report': 'বিক্রয় রিপোর্ট', 'Salary Slip': 'বেতন স্লিপ', 'Service Invoice': 'সার্ভিস ইনভয়েস',
  'Due Receipt': 'বাকি রসিদ', 'Employee Profile': 'কর্মচারী প্রোফাইল',
  'Add at least one item': 'অন্তত একটি আইটেম যোগ করুন',

  // ---- Table columns / field labels ----
  Action: 'অ্যাকশন', Amount: 'পরিমাণ', Audience: 'অডিয়েন্স', Balance: 'ব্যালেন্স', Bill: 'বিল',
  Business: 'ব্যবসা', Buy: 'ক্রয়', Campaign: 'ক্যাম্পেইন', Campaigns: 'ক্যাম্পেইনসমূহ',
  Category: 'ক্যাটাগরি', Channel: 'চ্যানেল', 'Close by': 'শেষ হবে', Companies: 'কোম্পানি',
  Company: 'কোম্পানি', Contact: 'যোগাযোগ', Contacts: 'যোগাযোগসমূহ', Customer: 'গ্রাহক',
  Date: 'তারিখ', Deal: 'ডিল', Deals: 'ডিলসমূহ', Device: 'ডিভাইস', 'Disc %': 'ছাড় %',
  Down: 'ডাউন', 'Due date': 'বাকির তারিখ', 'Due Date': 'বাকির তারিখ', Entity: 'এন্টিটি',
  'Expected close': 'সম্ভাব্য সমাপ্তি', Expiry: 'মেয়াদ', 'Follow Up': 'ফলো আপ',
  'Follow Ups': 'ফলো আপসমূহ', 'Follow-up date': 'ফলো-আপ তারিখ', Industry: 'ইন্ডাস্ট্রি',
  Item: 'আইটেম', 'Job No': 'জব নম্বর', Leads: 'লিডস', Method: 'পদ্ধতি', Months: 'মাস',
  Name: 'নাম', Note: 'নোট', Notes: 'নোটসমূহ', Orders: 'অর্ডার', Owner: 'মালিক', Pay: 'পেমেন্ট',
  Period: 'সময়কাল', Phone: 'ফোন', Pipeline: 'পাইপলাইন', Plan: 'প্ল্যান', Priority: 'প্রায়োরিটি',
  Product: 'পণ্য', Profit: 'লাভ', 'Related to': 'সম্পর্কিত', Revenue: 'আয়', Role: 'ভূমিকা',
  Sales: 'বিক্রয়', Sell: 'বিক্রয়', Sent: 'পাঠানো হয়েছে', Sold: 'বিক্রিত', Source: 'উৎস',
  Stage: 'পর্যায়', Stock: 'স্টক', Task: 'টাস্ক', Tasks: 'টাস্কসমূহ', Technician: 'টেকনিশিয়ান',
  Time: 'সময়', Title: 'শিরোনাম', 'Total Purchase': 'মোট ক্রয়', Type: 'ধরন', User: 'ইউজার',
  Value: 'মূল্য', Website: 'ওয়েবসাইট', 'TRX ID': 'টিআরএক্স আইডি', 'Emp ID': 'কর্মচারী আইডি',
  When: 'কখন', 'With / about': 'সম্পর্কে', Status: 'স্ট্যাটাস', Warranty: 'ওয়ারেন্টি',
  'Warranty Until': 'ওয়ারেন্টি পর্যন্ত', 'Sold On': 'বিক্রির তারিখ', 'Sold To': 'বিক্রি হয়েছে',
  'Brand Warranty': 'ব্র্যান্ড ওয়ারেন্টি', 'Shop Warranty': 'দোকান ওয়ারেন্টি',
  'Brand Warranty Until': 'ব্র্যান্ড ওয়ারেন্টি পর্যন্ত', 'Shop Warranty Until': 'দোকান ওয়ারেন্টি পর্যন্ত',
  Serial: 'সিরিয়াল', Mobile: 'মোবাইল', 'Monthly Salary': 'মাসিক বেতন',
  'Joining Date': 'যোগদানের তারিখ', Designation: 'পদবি', Department: 'বিভাগ', Gender: 'লিঙ্গ',
  'Date of Birth': 'জন্ম তারিখ', 'Emergency Contact': 'জরুরি যোগাযোগ', 'Employee ID': 'কর্মচারী আইডি',
  Address: 'ঠিকানা', Email: 'ইমেইল', Discount: 'ছাড়', 'IMEI 1': 'আইএমইআই ১', 'IMEI 2': 'আইএমইআই ২',

  // ---- Empty states ----
  'No EMI plans yet': 'এখনো কোনো ইএমআই প্ল্যান নেই', 'No activity recorded yet': 'এখনো কোনো কার্যকলাপ নেই',
  'No businesses yet': 'এখনো কোনো ব্যবসা নেই', 'No campaigns yet': 'এখনো কোনো ক্যাম্পেইন নেই',
  'No expenses recorded': 'কোনো খরচ রেকর্ড নেই', 'No orders yet': 'এখনো কোনো অর্ডার নেই',
  'No payments yet': 'এখনো কোনো পেমেন্ট নেই', 'No pending payments 🎉': 'কোনো বকেয়া পেমেন্ট নেই 🎉',
  'No purchases yet': 'এখনো কোনো ক্রয় নেই', 'No sales yet': 'এখনো কোনো বিক্রয় নেই',
  'No service jobs yet': 'এখনো কোনো সার্ভিস জব নেই', 'No suppliers yet': 'এখনো কোনো সরবরাহকারী নেই',
  'Nothing here yet': 'এখানে এখনো কিছু নেই', 'No held bills': 'কোনো হোল্ড করা বিল নেই',
  'No items added': 'কোনো আইটেম যোগ করা হয়নি', 'No units yet': 'এখনো কোনো ইউনিট নেই',
  'No entries': 'কোনো এন্ট্রি নেই', 'Loading...': 'লোড হচ্ছে...', 'Loading…': 'লোড হচ্ছে…',
  'No device found for this IMEI / serial in your shop.': 'এই আইএমইআই / সিরিয়ালের কোনো ডিভাইস আপনার দোকানে পাওয়া যায়নি।',

  // ---- Toasts ----
  Added: 'যোগ হয়েছে', 'Campaign saved': 'ক্যাম্পেইন সংরক্ষিত', 'Cart held': 'কার্ট হোল্ড হয়েছে',
  'Cart is empty': 'কার্ট খালি', 'Cart resumed': 'কার্ট পুনরায় চালু',
  'Customer name is required': 'গ্রাহকের নাম প্রয়োজন', Deleted: 'মুছে ফেলা হয়েছে',
  'Describe the campaign first': 'আগে ক্যাম্পেইন বর্ণনা দিন', 'Device already in cart': 'ডিভাইস ইতিমধ্যে কার্টে আছে',
  'Device model is required': 'ডিভাইস মডেল প্রয়োজন', 'Device(s) added': 'ডিভাইস যোগ হয়েছে',
  'Discount must be between 0 and 100%': 'ছাড় ০ থেকে ১০০% এর মধ্যে হতে হবে',
  'Draft generated': 'ড্রাফট তৈরি হয়েছে', 'Due collected': 'বাকি আদায় হয়েছে',
  'EMI plan created': 'ইএমআই প্ল্যান তৈরি হয়েছে', 'Employee added': 'কর্মচারী যোগ হয়েছে',
  'Employee deleted': 'কর্মচারী মুছে ফেলা হয়েছে', 'Employee updated': 'কর্মচারী আপডেট হয়েছে',
  'Enter a valid amount': 'সঠিক পরিমাণ লিখুন', 'Enter a valid quantity': 'সঠিক পরিমাণ লিখুন',
  'Enter a valid total amount': 'সঠিক মোট পরিমাণ লিখুন', 'Enter an IMEI or serial': 'একটি আইএমইআই বা সিরিয়াল লিখুন',
  'Expiry date is required for medicines': 'ওষুধের জন্য মেয়াদের তারিখ প্রয়োজন',
  'Full name is required': 'পূর্ণ নাম প্রয়োজন', 'Image too large (max 3MB)': 'ছবি অনেক বড় (সর্বোচ্চ ৩এমবি)',
  'Instalment paid': 'কিস্তি পরিশোধ হয়েছে', 'Logo must be under 3 MB': 'লোগো ৩ এমবি এর কম হতে হবে',
  'Mobile number is required': 'মোবাইল নম্বর প্রয়োজন', 'Months must be at least 1': 'মাস অন্তত ১ হতে হবে',
  'Name and message are required': 'নাম ও বার্তা প্রয়োজন', 'Name is required': 'নাম প্রয়োজন',
  'Name, email, password and shop name are required': 'নাম, ইমেইল, পাসওয়ার্ড ও দোকানের নাম প্রয়োজন',
  'Not enough stock': 'পর্যাপ্ত স্টক নেই', 'Out of stock': 'স্টক শেষ',
  'Owner account created': 'মালিক অ্যাকাউন্ট তৈরি হয়েছে', 'Owner status updated': 'মালিকের স্ট্যাটাস আপডেট হয়েছে',
  'Paste at least one IMEI': 'অন্তত একটি আইএমইআই পেস্ট করুন', 'Payment recorded': 'পেমেন্ট রেকর্ড হয়েছে',
  'Payment submitted — admin approve korle active hobe': 'পেমেন্ট জমা হয়েছে — অ্যাডমিন অনুমোদন করলে সক্রিয় হবে',
  'Please choose an image file': 'একটি ছবি ফাইল নির্বাচন করুন', 'Purchase recorded': 'ক্রয় রেকর্ড হয়েছে',
  'Salary recorded': 'বেতন রেকর্ড হয়েছে', 'Sale completed!': 'বিক্রয় সম্পন্ন!', Saved: 'সংরক্ষিত',
  'Scan the IMEI / serial to add this device': 'এই ডিভাইস যোগ করতে আইএমইআই / সিরিয়াল স্ক্যান করুন',
  'Settings saved': 'সেটিংস সংরক্ষিত', 'Transaction ID lagbe': 'ট্রানজেকশন আইডি লাগবে',
  'Welcome back!': 'স্বাগতম!', 'Expense added': 'খরচ যোগ হয়েছে', 'AI error': 'এআই ত্রুটি', Error: 'ত্রুটি',

  // ---- Select / option values ----
  Active: 'সক্রিয়', Inactive: 'নিষ্ক্রিয়', 'All Designations': 'সব পদবি', 'All Status': 'সব স্ট্যাটাস',
  'All statuses': 'সব স্ট্যাটাস', 'All customers': 'সব গ্রাহক', 'Customers with due': 'বাকিসহ গ্রাহক',
  Daily: 'দৈনিক', Monthly: 'মাসিক', 'EMI / Installment': 'ইএমআই / কিস্তি', SMS: 'এসএমএস',
  Female: 'মহিলা', Male: 'পুরুষ', Festive: 'উৎসব', Friendly: 'বন্ধুত্বপূর্ণ', Professional: 'পেশাদার',
  Urgent: 'জরুরি', General: 'সাধারণ', 'General Shop': 'সাধারণ দোকান',
  'Technology Management System': 'টেকনোলজি ম্যানেজমেন্ট সিস্টেম', Pharmacy: 'ফার্মেসি', Other: 'অন্যান্য',
  Rent: 'ভাড়া', Salary: 'বেতন', Utility: 'ইউটিলিটি', Purchase: 'ক্রয়', Cash: 'নগদ', Card: 'কার্ড',
  'Walk-in': 'ওয়াক-ইন', Select: 'নির্বাচন করুন', 'Thermal (80mm)': 'থার্মাল (৮০মিমি)',
  'Thermal 80mm': 'থার্মাল ৮০মিমি', 'Generic HTTP API': 'জেনেরিক HTTP API',

  // ---- Settings / integrations ----
  Provider: 'প্রোভাইডার', Currency: 'মুদ্রা', Theme: 'থিম', Preferences: 'পছন্দসমূহ',
  'Integrations & Keys': 'ইন্টিগ্রেশন ও কী', 'Business Profile': 'ব্যবসার প্রোফাইল',
  'Business Name': 'ব্যবসার নাম', 'Business Type': 'ব্যবসার ধরন',
  'Shop / Business Name': 'দোকান / ব্যবসার নাম', 'Shop Logo': 'দোকানের লোগো',
  'Owner Name': 'মালিকের নাম', 'Default Print Mode': 'ডিফল্ট প্রিন্ট মোড',
  'Low Stock Threshold': 'কম স্টক সীমা', Password: 'পাসওয়ার্ড',
  'Password / App password': 'পাসওয়ার্ড / অ্যাপ পাসওয়ার্ড', Username: 'ইউজারনেম', Port: 'পোর্ট',
  'SMTP Host': 'SMTP হোস্ট', 'From email': 'প্রেরকের ইমেইল', 'From name': 'প্রেরকের নাম',
  'From number': 'প্রেরকের নম্বর', Subject: 'বিষয়', Message: 'বার্তা', 'Test email to': 'টেস্ট ইমেইল',
  'Test phone': 'টেস্ট ফোন', 'API Key': 'API কী', 'API URL': 'API ইউআরএল',
  'Sender ID / Mask': 'প্রেরক আইডি / মাস্ক', 'Sender Number': 'প্রেরক নম্বর',
  'PNG/JPG, shown on invoices & receipts. Max 3 MB.': 'PNG/JPG, ইনভয়েস ও রসিদে দেখানো হবে। সর্বোচ্চ ৩ এমবি।',

  // ---- POS ----
  'POS / New Sale': 'পিওএস / নতুন বিক্রয়', 'Total Bill': 'মোট বিল', 'Total Amount': 'মোট পরিমাণ',
  'Payment Method': 'পেমেন্ট পদ্ধতি', 'Customer Name': 'গ্রাহকের নাম', 'Customer Phone': 'গ্রাহকের ফোন',
  'Customer (optional)': 'গ্রাহক (ঐচ্ছিক)', 'Discount (%)': 'ছাড় (%)', 'Discount (flat)': 'ছাড় (নির্দিষ্ট)',
  'Discounted Price': 'ছাড়কৃত মূল্য', Items: 'আইটেমসমূহ', 'Item / Description': 'আইটেম / বিবরণ',
  'Amount to collect': 'আদায়ের পরিমাণ', 'Current Status': 'বর্তমান স্ট্যাটাস',
  'Amount:': 'পরিমাণ:', 'Current due:': 'বর্তমান বাকি:', 'In stock:': 'স্টকে:',
  'Past Invoices': 'পুরোনো ইনভয়েস', Reprint: 'পুনরায় প্রিন্ট', Search: 'খুঁজুন', Back: 'ফিরে যান',
  'Search by phone or name…': 'ফোন বা নাম দিয়ে খুঁজুন…',
  'Search a customer by phone number or name.': 'ফোন নম্বর বা নাম দিয়ে গ্রাহক খুঁজুন।',
  'No invoices yet': 'এখনো কোনো ইনভয়েস নেই', 'No phone': 'ফোন নেই', 'No customer': 'কোনো গ্রাহক নেই',
  'Customer name and phone are required': 'গ্রাহকের নাম ও ফোন প্রয়োজন',
  'Customer name': 'গ্রাহকের নাম',
  'Matching devices (IMEI / serial)': 'মিলে যাওয়া ডিভাইস (আইএমইআই / সিরিয়াল)',
  'Search products or IMEI / serial...': 'পণ্য বা আইএমইআই / সিরিয়াল খুঁজুন...',

  // ---- Products ----
  'Product Image': 'পণ্যের ছবি', 'Selling Price': 'বিক্রয় মূল্য', 'Purchase Price': 'ক্রয় মূল্য',
  Brand: 'ব্র্যান্ড', Color: 'রং', 'Storage (RAM/ROM)': 'স্টোরেজ (RAM/ROM)', Model: 'মডেল',
  'Batch No': 'ব্যাচ নম্বর', 'Brand Warranty (months)': 'ব্র্যান্ড ওয়ারেন্টি (মাস)',
  'Shop Warranty (months)': 'দোকান ওয়ারেন্টি (মাস)', 'Bulk add (one IMEI per line)': 'একসাথে যোগ (প্রতি লাইনে একটি আইএমইআই)',
  'Expiry Date': 'মেয়াদ তারিখ', Unit: 'ইউনিট', 'IMEI / Serial': 'আইএমইআই / সিরিয়াল',

  // ---- Employees / customers ----
  'Personal Information': 'ব্যক্তিগত তথ্য', 'Employment Information': 'চাকরির তথ্য',
  'Department (optional)': 'বিভাগ (ঐচ্ছিক)', 'Email (optional)': 'ইমেইল (ঐচ্ছিক)',
  'NID / Identity': 'এনআইডি / পরিচয়', 'Customer NID / Identity': 'গ্রাহক এনআইডি / পরিচয়',
  'Customer Budget': 'গ্রাহকের বাজেট',

  // ---- EMI / installments ----
  'Down Payment': 'ডাউন পেমেন্ট', 'Number of Months': 'মাসের সংখ্যা',
  'First Due Date': 'প্রথম বাকির তারিখ', 'Due added': 'বাকি যোগ হয়েছে', 'Paid now': 'এখন পরিশোধিত',
  'Select customer': 'গ্রাহক নির্বাচন করুন', 'Please select a customer': 'একজন গ্রাহক নির্বাচন করুন',

  // ---- Services ----
  'Device Model': 'ডিভাইস মডেল', 'Problem / Fault': 'সমস্যা / ত্রুটি', 'Parts Cost': 'পার্টস খরচ',
  'Service Fee': 'সার্ভিস ফি',

  // ---- Subscription ----
  'Active Plan': 'সক্রিয় প্ল্যান', 'Valid Until': 'মেয়াদ পর্যন্ত', Expired: 'মেয়াদোত্তীর্ণ',
  Unpaid: 'অপরিশোধিত', 'Transaction ID (TRX)': 'ট্রানজেকশন আইডি (TRX)',
  'Reference / Memo No': 'রেফারেন্স / মেমো নম্বর',

  // ---- Login ----
  'Shop ERP Login': 'শপ ইআরপি লগইন',
  'Manage your whole business in one place': 'আপনার পুরো ব্যবসা এক জায়গায় পরিচালনা করুন',
  'Accounts are created by the administrator.': 'অ্যাকাউন্ট অ্যাডমিনিস্ট্রেটর তৈরি করেন।',
  'Created by': 'তৈরি করেছে',

  // ---- Change password ----
  'Change Password': 'পাসওয়ার্ড পরিবর্তন', 'Account Email': 'অ্যাকাউন্ট ইমেইল',
  'Current Password': 'বর্তমান পাসওয়ার্ড', 'Enter your current password': 'আপনার বর্তমান পাসওয়ার্ড দিন',
  'Current password is incorrect': 'বর্তমান পাসওয়ার্ড ভুল',
  'Enter your current password, then choose a new one.': 'আপনার বর্তমান পাসওয়ার্ড দিন, তারপর নতুন একটি দিন।',
  'Send Code': 'কোড পাঠান', 'Resend Code': 'আবার কোড পাঠান', 'Verification Code': 'যাচাই কোড',
  'New Password': 'নতুন পাসওয়ার্ড', 'Confirm Password': 'পাসওয়ার্ড নিশ্চিত করুন',
  '6-digit code': '৬-অঙ্কের কোড',
  "We'll email a 6-digit code to your account email to confirm it's you, then you can set a new password.":
    'আপনি যে আপনি তা নিশ্চিত করতে আপনার অ্যাকাউন্ট ইমেইলে একটি ৬-অঙ্কের কোড পাঠাব, তারপর নতুন পাসওয়ার্ড দিতে পারবেন।',
  'Verification code sent to your email': 'যাচাই কোড আপনার ইমেইলে পাঠানো হয়েছে',
  'Password changed successfully': 'পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে',
  'Passwords do not match': 'পাসওয়ার্ড মিলছে না',
  'Password must be at least 6 characters': 'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে',
  'Enter the 6-digit code': '৬-অঙ্কের কোড লিখুন', 'Enter your account email': 'আপনার অ্যাকাউন্ট ইমেইল লিখুন',

  // ---- AI assistant ----
  'AI Assistant': 'এআই অ্যাসিস্ট্যান্ট', Enabled: 'চালু', Model: 'মডেল',
  'AI already works for free — you can leave this blank. Only fill it in if you want to use your own paid OpenAI / Claude key.':
    'এআই এমনিতেই ফ্রি কাজ করে — এটা ফাঁকা রাখতে পারেন। নিজের পেইড OpenAI / Claude key ব্যবহার করতে চাইলেই কেবল এটা পূরণ করুন।',
};

const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE']);

function swap(s) {
  if (!s) return s;
  const key = s.trim();
  if (!key || !bn[key]) return s;
  const lead = s.match(/^\s*/)[0];
  const trail = s.match(/\s*$/)[0];
  return lead + bn[key] + trail;
}

function fixText(node) {
  const next = swap(node.nodeValue);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function fixAttrs(el) {
  if (!el.hasAttribute) return;
  for (const a of ATTRS) {
    if (el.hasAttribute(a)) {
      const cur = el.getAttribute(a);
      const next = swap(cur);
      if (next !== cur) el.setAttribute(a, next);
    }
  }
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) return fixText(root); // text node
  if (root.nodeType !== 1) return; // not an element
  if (SKIP_TAGS.has(root.tagName)) return;
  fixAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (SKIP_TAGS.has(n.parentNode?.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = tw.nextNode())) fixText(n);
  root.querySelectorAll?.('[placeholder],[title],[alt],[aria-label]').forEach(fixAttrs);
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  // Live DOM translator — only active in Bangla. Translating back to English
  // happens via a full reload (see toggleLang), which keeps React happy.
  useEffect(() => {
    if (lang !== 'bn') return;
    walk(document.body);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') fixText(m.target);
        else if (m.type === 'attributes' && m.target.nodeType === 1) fixAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS,
    });
    return () => obs.disconnect();
  }, [lang]);

  const toggleLang = () => {
    const next = lang === 'en' ? 'bn' : 'en';
    localStorage.setItem('lang', next);
    window.location.reload(); // cleanest switch — repaints the whole app
  };

  const t = (key) => (lang === 'bn' ? bn[key] || key : key);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
