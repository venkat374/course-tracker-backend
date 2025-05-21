const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 5000; // Use port from .env or default to 5000

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// MongoDB Connection
const uri = process.env.ATLAS_URI; // Get MongoDB URI from .env
mongoose.connect(uri)
  .then(() => console.log("MongoDB database connection established successfully"))
  .catch(err => console.error("MongoDB connection error:", err));

// --- Mongoose Schema & Model ---
const Schema = mongoose.Schema;

const trackedCourseSchema = new Schema({
    userId: { type: String, required: true }, // Links the course to a specific user
    courseName: { type: String, required: true, trim: true, minlength: 3 }, // Added minlength for basic validation
    status: { type: String, required: true, enum: ['Ongoing', 'Completed', 'Planned'] },
    instructor: { type: String, required: false, trim: true },
    completionDate: { type: Date, required: false },
    certificateLink: { type: String, required: false, trim: true },
    progress: { type: Number, required: true, min: 0, max: 100 },
    notes: { type: String, required: false },
}, {
    timestamps: true, // Adds createdAt and updatedAt timestamps automatically
});

const TrackedCourse = mongoose.model('TrackedCourse', trackedCourseSchema);

// --- Simple Authentication Middleware (for userId) ---
// This middleware checks if a userId is provided in the request.
// In a real application, this would be replaced with proper user authentication (JWT, sessions, etc.).
const isAuthenticated = (req, res, next) => {
    // For GET/DELETE (query parameters)
    let userId = req.query.userId;
    // For POST/PUT (request body)
    if (!userId && req.body && req.body.userId) {
        userId = req.body.userId;
    }
    // For DELETE requests where userId might be nested in `data` property of body
    if (!userId && req.method === 'DELETE' && req.body.data && req.body.data.userId) {
        userId = req.body.data.userId;
    }

    if (!userId) {
        console.warn('Authentication failed: userId missing from request.');
        return res.status(401).json({ message: 'Unauthorized: User ID is required.' });
    }
    req.userId = userId; // Attach the userId to the request for subsequent route handlers
    next(); // Proceed to the next middleware/route handler
};

// --- API Routes ---

// GET: Retrieve all tracked courses for a specific user
app.get('/tracked-courses', isAuthenticated, (req, res) => {
    TrackedCourse.find({ userId: req.userId }) // Filter by the authenticated user's ID
        .sort({ createdAt: -1 }) // Sort by creation date, newest first
        .then(courses => res.json(courses))
        .catch(err => res.status(500).json({ message: 'Error fetching courses: ' + err.message }));
});

// POST: Add a new tracked course
app.post('/tracked-courses/add', isAuthenticated, (req, res) => {
    const { courseName, status, instructor, completionDate, certificateLink, progress, notes } = req.body;
    const userId = req.userId; // Get userId from the middleware

    // Basic validation (more robust validation can be added with Joi/Express-validator)
    if (!courseName || !status || progress === undefined) {
        return res.status(400).json({ message: 'Missing required fields: courseName, status, progress.' });
    }
    if (!['Ongoing', 'Completed', 'Planned'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value.' });
    }
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return res.status(400).json({ message: 'Progress must be a number between 0 and 100.' });
    }

    const newTrackedCourse = new TrackedCourse({
        userId,
        courseName,
        status,
        instructor: instructor || null, // Store as null if empty string
        completionDate: completionDate ? new Date(completionDate) : null, // Store as null if empty
        certificateLink: certificateLink || null,
        progress: Number(progress),
        notes: notes || null,
    });

    newTrackedCourse.save()
        .then(() => res.status(201).json({ message: 'Course added successfully!' })) // 201 Created
        .catch(err => res.status(400).json({ message: 'Error adding course: ' + err.message }));
});

// GET: Retrieve a single tracked course by ID
app.get('/tracked-courses/:id', isAuthenticated, (req, res) => {
    TrackedCourse.findOne({ _id: req.params.id, userId: req.userId }) // Ensure course belongs to the user
        .then(course => {
            if (!course) {
                return res.status(404).json({ message: 'Course not found or not authorized.' });
            }
            res.json(course);
        })
        .catch(err => res.status(500).json({ message: 'Error fetching course: ' + err.message }));
});

// POST: Update an existing tracked course by ID
app.post('/tracked-courses/update/:id', isAuthenticated, (req, res) => {
    TrackedCourse.findOne({ _id: req.params.id, userId: req.userId }) // Find by ID and user
        .then(course => {
            if (!course) {
                return res.status(404).json({ message: 'Course not found or not authorized to update.' });
            }

            // Update fields
            course.courseName = req.body.courseName;
            course.status = req.body.status;
            course.instructor = req.body.instructor || null;
            course.completionDate = req.body.completionDate ? new Date(req.body.completionDate) : null;
            course.certificateLink = req.body.certificateLink || null;
            course.progress = Number(req.body.progress);
            course.notes = req.body.notes || null;

            // Save the updated course
            course.save()
                .then(() => res.json({ message: 'Course updated successfully!' }))
                .catch(err => res.status(400).json({ message: 'Error updating course: ' + err.message }));
        })
        .catch(err => res.status(500).json({ message: 'Error: ' + err.message }));
});

// DELETE: Delete a tracked course by ID
app.delete('/tracked-courses/:id', isAuthenticated, (req, res) => {
    TrackedCourse.deleteOne({ _id: req.params.id, userId: req.userId }) // Delete only if it belongs to user
        .then(result => {
            if (result.deletedCount === 0) {
                return res.status(404).json({ message: 'Course not found or not authorized to delete.' });
            }
            res.json({ message: 'Course deleted successfully.' });
        })
        .catch(err => res.status(500).json({ message: 'Error deleting course: ' + err.message }));
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});