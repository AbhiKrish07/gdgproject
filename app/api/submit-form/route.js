import { connect } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import * as z from "zod";

export const dynamic = "force-dynamic";

const submitSchema = z.object({
  Name: z.string().min(1, "Name is required"),
  RegistrationNumber: z.string().regex(/^\d{2}[A-Z]{3}\d{4}$/, "Invalid Registration Number"),
  Email: z.string().email(),
  Phone: z.string().regex(/^\d{10}$/, "Invalid Phone Number"),
  "Year of Study": z.string().optional(),
  Department: z.string().min(1, "Department is required"),
  Questions: z.record(z.string()).optional(),
}).catchall(z.any()); // allow extra form fields

export async function POST(req) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      return new Response(
        JSON.stringify({ message: "Authentication required" }),
        { status: 401 }
      );
    }

    const user = session.user;
    const userEmail = user.email;

    const deadline = new Date("2026-08-23T23:59:59+05:30");
    if (new Date() > deadline)
      return new Response(
        JSON.stringify({
          message: "The submission deadline has passed"
        }),
        { status: 403 }
      );
                  

    const db = await connect();
    const data = await req.json();

    const validationResult = submitSchema.safeParse(data);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          message: "Invalid form data provided",
          errors: validationResult.error.errors
        }),
        { status: 400 }
      );
    }

    const { Department, Questions, ...formFields } = validationResult.data;

    const collection = db.collection("formData");

    // Fetch existing submissions for this user to enforce the limit of 2 unique applications
    const existingSubmissions = await collection.where("Email", "==", userEmail).get();

    // The key hidden bug was a race condition here: if multiple requests came at the exact same time, 
    // `existingSubmissions` would be empty for all, and `collection.add` would write multiple duplicates.
    // Instead of auto-generating document IDs, we create a deterministic composite ID:
    const documentId = `${userEmail}_${Department}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    const alreadySubmittedDept = existingSubmissions.docs.some(
      (doc) => doc.data()?.Department === Department
    );

    if (alreadySubmittedDept) {
      return new Response(
        JSON.stringify({
          message: `You have already submitted an application for ${Department}`,
        }),
        { status: 400 }
      );
    }

    if (existingSubmissions.size >= 2) {
      return new Response(
        JSON.stringify({
          message: "Remember that you can only submit upto 2 unique applications",
        }),
        { status: 400 }
      );
    }

    const docRef = collection.doc(documentId);

    // Using a transaction to ensure atomic read-and-write and eliminate race condition completely
    await db.runTransaction(async (transaction) => {
      const docSnapshot = await transaction.get(docRef);

      if (docSnapshot.exists) {
        throw new Error("ALREADY_SUBMITTED");
      }

      transaction.set(docRef, {
        ...formFields,
        Department,
        Questions,
        Email: userEmail,
        createdAt: new Date(),
      });
    });

    return new Response(
      JSON.stringify({
        message: "Form submitted successfully!",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Form submission error:", error);
    if (error.message === "ALREADY_SUBMITTED") {
      return new Response(
        JSON.stringify({ message: "You have already submitted an application for this department." }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ message: "Error submitting form" }), {
      status: 500,
    });
  }
}
