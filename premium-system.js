
/* =====================================================
   CHEMPHYBIO MDCAT — PREMIUM SYSTEM
   Separate secure premium questions and memberships
===================================================== */

import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* ---------------- COLLECTIONS ---------------- */

const PREMIUM_QUESTIONS = "premiumQuestions";
const PACKAGES = "membershipPackages";
const MEMBERS = "premiumMembers";
const PAYMENTS = "paymentRequests";
const PAYMENT_SETTINGS = "paymentSettings";


/* ---------------- HELPERS ---------------- */

function currentEmail() {
  return auth.currentUser?.email?.trim().toLowerCase() || "";
}

function requireLogin() {
  if (!auth.currentUser) {
    throw new Error("Please login with Google first.");
  }
}

function requireEmail() {
  requireLogin();

  const email = currentEmail();

  if (!email) {
    throw new Error("Google account email is unavailable.");
  }

  return email;
}


/* =====================================================
   1. SAVE MCQ — FREE OR PREMIUM
===================================================== */

export async function savePremiumSystemQuestion(questionData, accessType = "free", questionId = null) {
  requireLogin();

  const question = {
    subject: String(questionData.subject || "").trim(),
    chapter: String(questionData.chapter || "").trim(),
    question: String(questionData.question || "").trim(),
    options: questionData.options,
    answer: Number(questionData.answer),
    explanation: String(questionData.explanation || "").trim(),
    updatedAt: serverTimestamp()
  };

  if (
    !question.subject ||
    !question.chapter ||
    !question.question ||
    !Array.isArray(question.options) ||
    question.options.length !== 4 ||
    !Number.isInteger(question.answer) ||
    question.answer < 0 ||
    question.answer > 3
  ) {
    throw new Error("Please complete all MCQ fields correctly.");
  }

  const targetCollection =
    accessType === "premium"
      ? PREMIUM_QUESTIONS
      : "questions";

  if (questionId) {
    await updateDoc(doc(db, targetCollection, questionId), question);
    return questionId;
  }

  question.createdAt = serverTimestamp();

  const result = await addDoc(
    collection(db, targetCollection),
    question
  );

  return result.id;
}


/* =====================================================
   2. LOAD PREMIUM QUESTIONS
===================================================== */

export async function loadPremiumSystemQuestions() {
  requireLogin();

  const snapshot = await getDocs(
    collection(db, PREMIUM_QUESTIONS)
  );

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   3. DELETE PREMIUM QUESTION
===================================================== */

export async function deletePremiumSystemQuestion(questionId) {
  requireLogin();

  const { deleteDoc } = await import(
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
  );

  await deleteDoc(doc(db, PREMIUM_QUESTIONS, questionId));
}


/* =====================================================
   4. CREATE MEMBERSHIP PACKAGE
===================================================== */

export async function createMembershipPackage({
  name,
  price,
  durationDays,
  description = ""
}) {
  requireLogin();

  const packageData = {
    name: String(name || "").trim(),
    price: Number(price),
    durationDays: Number(durationDays),
    description: String(description).trim(),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (
    !packageData.name ||
    !Number.isFinite(packageData.price) ||
    packageData.price < 0 ||
    !Number.isInteger(packageData.durationDays) ||
    packageData.durationDays < 1
  ) {
    throw new Error("Invalid package details.");
  }

  const result = await addDoc(
    collection(db, PACKAGES),
    packageData
  );

  return result.id;
}


/* =====================================================
   5. LOAD ACTIVE PACKAGES
===================================================== */

export async function loadMembershipPackages() {
  const packageQuery = query(
    collection(db, PACKAGES),
    where("active", "==", true)
  );

  const snapshot = await getDocs(packageQuery);

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   6. ADMIN — LOAD ALL PAYMENT REQUESTS
===================================================== */

export async function loadPaymentRequests() {
  requireLogin();

  const snapshot = await getDocs(
    query(
      collection(db, PAYMENTS),
      orderBy("createdAt", "desc")
    )
  );

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   7. STUDENT — SUBMIT MANUAL PAYMENT REQUEST
===================================================== */

export async function submitPremiumPayment({
  packageId,
  paymentMethod,
  transactionId
}) {
  const email = requireEmail();

  const packageRef = doc(db, PACKAGES, packageId);
  const packageSnapshot = await getDoc(packageRef);

  if (!packageSnapshot.exists() ||
      packageSnapshot.data().active !== true) {
    throw new Error("This package is unavailable.");
  }

  const selectedPackage = packageSnapshot.data();

  const paymentData = {
    email,
    packageId,
    packageName: selectedPackage.name,
    amount: Number(selectedPackage.price),
    paymentMethod: String(paymentMethod || "").trim(),
    transactionId: String(transactionId || "").trim(),
    status: "pending",
    createdAt: serverTimestamp()
  };

  if (
    !paymentData.paymentMethod ||
    !paymentData.transactionId
  ) {
    throw new Error("Enter your payment details.");
  }

  const result = await addDoc(
    collection(db, PAYMENTS),
    paymentData
  );

  return result.id;
}


/* =====================================================
   8. ADMIN — APPROVE PAYMENT AND ACTIVATE MEMBERSHIP
===================================================== */

export async function approvePremiumPayment(requestId) {
  requireLogin();

  const requestRef = doc(db, PAYMENTS, requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) {
    throw new Error("Payment request not found.");
  }

  const payment = requestSnapshot.data();

  if (payment.status !== "pending") {
    throw new Error("This request has already been processed.");
  }

  const email = String(payment.email || "").trim().toLowerCase();

  if (!email || !payment.packageId) {
    throw new Error("Invalid payment request.");
  }

  const packageSnapshot = await getDoc(
    doc(db, PACKAGES, payment.packageId)
  );

  if (!packageSnapshot.exists()) {
    throw new Error("Membership package not found.");
  }

  const selectedPackage = packageSnapshot.data();
  const durationDays = Number(selectedPackage.durationDays);

  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new Error("Invalid membership duration.");
  }

  const memberRef = doc(db, MEMBERS, email);
  const memberSnapshot = await getDoc(memberRef);

  const now = new Date();

  let startDate = now;

  if (memberSnapshot.exists()) {
    const oldExpiry = memberSnapshot.data().expiresAt?.toDate?.();

    if (oldExpiry && oldExpiry > now) {
      startDate = oldExpiry;
    }
  }

  const expiryDate = new Date(
    startDate.getTime() +
    durationDays * 24 * 60 * 60 * 1000
  );

  const batch = writeBatch(db);

  batch.set(memberRef, {
    email,
    active: true,
    packageId: payment.packageId,
    packageName: selectedPackage.name,
    expiresAt: Timestamp.fromDate(expiryDate),
    approvedAt: serverTimestamp(),
    approvedBy: currentEmail()
  });

  batch.update(requestRef, {
    status: "approved",
    approvedAt: serverTimestamp()
  });

  await batch.commit();

  return expiryDate;
}


/* =====================================================
   9. ADMIN — REJECT PAYMENT
===================================================== */

export async function rejectPremiumPayment(requestId) {
  requireLogin();

  await updateDoc(
    doc(db, PAYMENTS, requestId),
    {
      status: "rejected",
      reviewedAt: serverTimestamp()
    }
  );
}


/* =====================================================
   10. CHECK CURRENT STUDENT MEMBERSHIP
===================================================== */

export async function checkPremiumMembership() {
  const email = requireEmail();

  const snapshot = await getDoc(
    doc(db, MEMBERS, email)
  );

  if (!snapshot.exists()) {
    return {
      active: false,
      reason: "No membership found."
    };
  }

  const member = snapshot.data();
  const expiry = member.expiresAt?.toDate?.();

  const active = member.active === true &&
    expiry instanceof Date &&
    expiry > new Date();

  return {
    active,
    email,
    packageName: member.packageName || "",
    expiresAt: expiry || null,
    reason: active ? "Membership active." : "Membership expired."
  };
}


/* =====================================================
   11. ADMIN — DEACTIVATE MEMBERSHIP
===================================================== */

export async function deactivatePremiumMember(email) {
  requireLogin();

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Enter a valid Gmail address.");
  }

  await updateDoc(
    doc(db, MEMBERS, normalizedEmail),
    {
      active: false,
      deactivatedAt: serverTimestamp()
    }
  );
}


/* =====================================================
   12. SAVE PAYMENT ACCOUNT SETTINGS
===================================================== */

export async function savePremiumPaymentSettings({
  easypaisaTitle,
  easypaisaNumber,
  jazzcashTitle,
  jazzcashNumber,
  instructions
}) {
  requireLogin();

  await setDoc(
    doc(db, PAYMENT_SETTINGS, "main"),
    {
      easypaisaTitle: String(easypaisaTitle || "").trim(),
      easypaisaNumber: String(easypaisaNumber || "").trim(),
      jazzcashTitle: String(jazzcashTitle || "").trim(),
      jazzcashNumber: String(jazzcashNumber || "").trim(),
      instructions: String(instructions || "").trim(),
      updatedAt: serverTimestamp()
    }
  );
}


/* =====================================================
   13. LOAD PAYMENT ACCOUNT SETTINGS
===================================================== */

export async function loadPremiumPaymentSettings() {
  const snapshot = await getDoc(
    doc(db, PAYMENT_SETTINGS, "main")
  );

  return snapshot.exists() ? snapshot.data() : null;
}
