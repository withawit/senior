const express = require("express");
const path = require("path");
const app = express();
const session = require('express-session');
const con = require("./config/db"); // เชื่อมต่อฐานข้อมูล
const bcrypt = require('bcrypt'); // ใช้ bcrypt สำหรับเข้ารหัสรหัสผ่าน
const passport = require('passport'); // เพิ่มการใช้ passport
const saltRounds = 10;
const expressLayouts = require('express-ejs-layouts');
const formidable = require('formidable');
const XLSX = require('xlsx');
const multer = require("multer");
const fs = require("fs");
const mysql = require('mysql');

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


const upload = multer({ dest: "uploads/" });

app.get('/getStudentId', (req, res) => {
  const email = req.query.email;

  // Query the database for studentid using email
  con.query('SELECT studentid FROM students WHERE email = ?', [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    if (results.length > 0) {
      res.json({ studentid: results[0].studentid });
    } else {
      res.status(404).json({ message: 'Student not found' });
    }
  });
});








// Add these headers before your routes
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Add security headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


let bookmarks = [];

// set "public" folder to be static folder, user can access it directly
app.use(express.static(path.join(__dirname, "public")));

// for json exchange
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// set view engine to EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// set up sessions
app.use(session({
  secret: 'SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // Session expires in 1 hour
}));

// initialize passport
app.use(passport.initialize());
app.use(passport.session());

const userAdmin = ["CHOMPHUNUT", "WACHIRARAT",];

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/login');
  }
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  } else {
    res.redirect('/dashboard');
  }
}









// =================== Login Route ===================
app.post("/login", isAuthenticated, (req, res) => {
  const { username, password } = req.body;

  // คิวรีฐานข้อมูลและยืนยันตัวผู้ใช้
  const sql = "SELECT id, username, password, role, studentid FROM user WHERE username = ?";
  con.query(sql, [username], (err, results) => {
    if (err) {
      return res.status(500).send("Database error.");
    }
    if (results.length === 0) {
      return res.status(401).json({ message: "Wrong username or password" });
    }

    const user = results[0];

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).send("Error checking password.");
      }
      if (!isMatch) {
        return res.status(401).json({ message: "Wrong username or password" });
      }

      req.session.user = { id: user.id, username: user.username, role: user.role, studentid: user.studentid };

      res.json({
        redirect: user.role === 2 ? '/dashboardadmin' : '/dashboard',
        studentId: user.studentid  // ส่ง studentId กลับไปที่ client-side
      });
    });
  });
});


// google authen
// google authen
app.post('/auth/google', (req, res) => {
  try {
    const userinfo = req.body.userinfo;

    if (!userinfo) {
      return res.status(400).json({ error: 'No user info provided' });
    }

    // Log user info for debugging
    console.log('Userinfo received:', userinfo);

    // Extract fullname from email if displayName or fullname is not provided
    const getNameFromEmail = (email) => {
      const namePart = email.split('@')[0]; // Get the part before the @ symbol
      return namePart
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()) // Capitalize each part
        .join(' '); // Join parts with space
    };

    const displayName = userinfo.displayName || userinfo.fullname || getNameFromEmail(userinfo.email);

    // Determine if user is admin based on email
    const isAdmin = userinfo.email.toLowerCase().includes('oraphan');
    console.log('isAdmin:', isAdmin);

    const sqlCheck = "SELECT * FROM student WHERE email = ?";
    con.query(sqlCheck, [userinfo.email], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (results.length === 0) {
        // Insert new record if user does not exist
        const sqlInsert = `INSERT INTO student 
          (email, facultyid, majorid, role, first_name, last_name, display_name, studentid) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        // Generate random values for facultyid, majorid, and studentid
        const randomFaculty = Math.floor(Math.random() * 10) + 1;
        const randomMajor = Math.floor(Math.random() * 10) + 1;
        const randomStudentId = Math.floor(Math.random() * 1000000); // Example ID generation

        // Split displayName into first name and last name
        const [firstName, lastName] = displayName.split(' ').length > 1
          ? displayName.split(' ')
          : [displayName, ''];

        // Assign role based on email
        const role = isAdmin ? 'admin' : 'student';

        con.query(sqlInsert, [userinfo.email, randomFaculty, randomMajor, role, firstName, lastName, displayName, randomStudentId], (err, result) => {
          if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).json({ error: 'Error inserting data' });
          }

          // Set session for the new user
          req.session.user = {
            id: randomStudentId,
            email: userinfo.email,
            firstName,
            lastName,
            displayName,
            role,
            studentid: randomStudentId,
          };

          console.log('New user inserted:', result.insertId);
          console.log('User displayName:', req.session.user.displayName);
          console.log('User role:', req.session.user.role);

          if (isAdmin) {
            res.redirect('/dashboardadmin');
          } else {
            res.json({
              success: true,
              role: req.session.user.role,
              studentid: req.session.user.studentid,
            });
          }
        });
      } else {
        // Handle existing user
        const student = results[0];

        // Use Google displayName or existing database display_name
        const displayName = userinfo.displayName || student.display_name;

        // Set role to admin if email contains 'oraphan'
        const role = isAdmin ? 'admin' : student.role;

        // Update session with existing user data
        req.session.user = {
          id: student.studentid,
          email: userinfo.email,
          firstName: student.first_name,
          lastName: student.last_name,
          displayName,
          role,
          studentid: student.studentid,
        };

        console.log('Found existing student:', student);
        console.log('User displayName:', req.session.user.displayName);
        console.log('User role:', req.session.user.role);

        if (isAdmin) {
          res.redirect('/dashboardadmin');
        } else {
          res.json({
            success: true,
            role: req.session.user.role,
            studentid: req.session.user.studentid,
          });
        }
      }
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});




app.get('/importstudent', (req, res) => {
  res.render('importstudent');  // Ensure 'post.ejs' exists in your views folder
});

app.get('/seelist', (req, res) => {
  res.render('seelist');  // Ensure 'post.ejs' exists in your views folder
});










app.get("/history", (req, res) => {
  const studentId = req.session.user.id;  // ดึง ID ของนักเรียนจาก session

  if (!studentId) {
    return res.redirect('/login');  // ถ้าไม่มี session ของนักเรียน ให้ไปที่หน้า login
  }

  const query = `
    SELECT 
        c.id AS course_id,
        c.name AS course_name, 
        c.code AS course_code, 
        c.rating AS course_rating
    FROM 
        student_course_history sch
    JOIN 
        coursee c ON sch.course_id = c.id
    WHERE 
        sch.studentid = ?;
  `;

  con.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Error querying database:", err);
      return res.status(500).send("Error retrieving course history");
    }

    // ส่งข้อมูลไปที่ view historycourese.ejs
    res.render("historycourese", {
      title: "History Page",
      courses: results,
    });
  });
});





// ---submitreview----
// ---submitreview----
// ---submitreview----
app.post('/submit-review', (req, res) => { 
  const student_id = req.session.user?.id;

  if (!student_id) {
    return res.status(400).send('User not logged in');
  }

  const { course_id, rate_easy, rate_collect, rate_registration, rate_content, rate_overview, review_detail } = req.body;

  // Calculate the average rating for the review
  const totalRating = parseFloat(rate_easy) + parseFloat(rate_collect) + parseFloat(rate_registration) + parseFloat(rate_content) + parseFloat(rate_overview);
  const averageRating = (totalRating / 5).toFixed(2);  // Round the average to 2 decimal places

  // Insert the review into the database
  const insertReviewQuery = `
    INSERT INTO course_reviews (course_id, student_id, rate_easy, rate_collect, rate_registration, rate_content, rate_overview, review_detail, average)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  con.query(
    insertReviewQuery,
    [course_id, student_id, rate_easy, rate_collect, rate_registration, rate_content, rate_overview, review_detail, averageRating],
    (err, result) => {
      if (err) {
        console.error('Error inserting review:', err);
        return res.status(500).send('Error inserting review');
      }

      // Recalculate the course's average rating
      const recalculateRatingQuery = `
        SELECT SUM(average) AS totalRating, COUNT(*) AS reviewCount
        FROM course_reviews
        WHERE course_id = ?
      `;

      con.query(recalculateRatingQuery, [course_id], (err, ratingResults) => {
        if (err) {
          console.error('Error recalculating course rating:', err);
          return res.status(500).send('Error recalculating course rating');
        }

        const totalRating = ratingResults[0]?.totalRating || 0;
        const reviewCount = ratingResults[0]?.reviewCount || 0;

        console.log(`Total rating: ${totalRating}, Review count: ${reviewCount}`);

        // Calculate the new average rating
        const newAverageRating = (totalRating / reviewCount).toFixed(2); // Ensure rounding to two decimal places

        console.log(`Recalculated new average rating for course ${course_id}: ${newAverageRating}`);

        // Update the course's rating in the database
        const updateCourseQuery = `
          UPDATE coursee
          SET rating = ?
          WHERE id = ?
        `;

        con.query(updateCourseQuery, [newAverageRating, course_id], (err, updateResult) => {
          if (err) {
            console.error('Error updating course rating:', err);
            return res.status(500).send('Error updating course rating');
          }

          console.log(`Course ${course_id} updated with new rating: ${newAverageRating}`);
          res.redirect('/listcourse'); // Redirect to the course list or another page
        });
      });
    }
  );
});














// ============= Course and Review Routes ==============

// Show all courses
app.get("/listcourse", isAuthenticated, function (req, res) {
  const userEmail = req.session.user?.email;

  if (!userEmail) {
    return res.status(401).send("Unauthorized access. Please log in.");
  }

  const sql = 'SELECT id, code, name, rating, type FROM coursee'; // Query to fetch all courses

  con.query(sql, (err, results) => {
    if (err) {
      console.error("Error in fetching data from the database:", err);
      return res.status(500).send("Error in fetching data from the database.");
    }

    let filteredCourses;
    let isMajorElectiveVisible = userEmail.includes('31501'); // Check if user can see Major Elective

    // Show all courses for users with emails starting with '643150'
    if (userEmail.endsWith('@lamduan.mfu.ac.th') && userEmail.includes('31501')) {
      filteredCourses = results;
    } else {
      // Show only Free Elective courses
      filteredCourses = results.filter(course => course.type === 'Free Elective');
    }

    // Render the list of courses and whether Major Elective should be visible
    res.render('listcourses', { 
      courses: filteredCourses, 
      showMajorElective: isMajorElectiveVisible 
    });
  });
});



// Show course details with reviews


// Show course details (for students only)
app.get('/course/:id', (req, res) => {
  const courseId = req.params.id;
  const user = req.session.user;

  // Check if the user session has data
  const userEmail = req.session.user ? req.session.user.email : 'Guest';
  const firstName = req.session.user ? req.session.user.firstName : '';
  const lastName = req.session.user ? req.session.user.lastName : '';

  // Queries to fetch course details and reviews
  const queryCourse = 'SELECT * FROM coursee WHERE id = ?';
  const queryReviews = `
    SELECT 
      cr.*, 
      s.email AS student_email
    FROM course_reviews cr
    JOIN student s ON cr.student_id = s.studentid
    WHERE cr.course_id = ?
  `;

  // Fetch course details and reviews concurrently
  con.query(queryCourse, [courseId], (err, courseDetails) => {
    if (err) {
      console.error('Error fetching course details:', err);
      return res.status(500).send('Error fetching course details.');
    }

    // If the course is not found, send a 404 response
    if (courseDetails.length === 0) {
      return res.status(404).send('Course not found.');
    }

    con.query(queryReviews, [courseId], (err, courseReviews) => {
      if (err) {
        console.error('Error fetching course reviews:', err);
        return res.status(500).send('Error fetching course reviews.');
      }

      // Map reviews and calculate normalized scores
      const reviewsWithScores = courseReviews.map((review) => {
        const totalNormalizedScore = (
          (review.rate_easy / 5) +
          (review.rate_collect / 5) +
          (review.rate_registration / 5) +
          (review.rate_content / 5) +
          (review.rate_overview / 5)
        );

        return {
          ...review,
          total_normalized_score: totalNormalizedScore.toFixed(1),
        };
      });

      // Render the course detail page with required data
      res.render('coursedetail', {
        course: courseDetails[0],    // Pass course details
        reviews: reviewsWithScores, // Pass processed reviews
        userEmail,                   // Pass user's email
        firstName,                   // Pass user's first name
        lastName,
        user,                    // Pass user's last name
      });
    });
  });
});

app.delete('/review/:id', (req, res) => {
  const reviewId = req.params.id;

  // Query to delete the review by its ID
  const deleteQuery = 'DELETE FROM course_reviews WHERE id = ?';

  con.query(deleteQuery, [reviewId], (err, result) => {
    if (err) {
      console.error('Error deleting review:', err);
      return res.status(500).send('Error deleting review.');
    }

    if (result.affectedRows === 0) {
      return res.status(404).send('Review not found.');
    }
    if (req.session.user.role !== 'admin') {
      return res.status(403).send('Unauthorized action.');
    }

    res.status(200).send('Review deleted successfully.');
  });
});













// Review specific course (for all logged-in users)
app.get('/review/:course_id', isAuthenticated, (req, res) => {
  const courseId = req.params.course_id;

  // Fetch course details from the database
  const queryCourse = 'SELECT * FROM coursee WHERE id = ?';
  con.query(queryCourse, [courseId], (err, courseDetails) => {
    if (err) {
      console.error("Error fetching course details:", err);
      return res.status(500).send('Error fetching course details.');
    }

    // Check if the course exists
    if (courseDetails.length === 0) {
      return res.status(404).send('Course not found.');
    }

    // Pass user's email and course details to the template
    res.render('review_courses', {
      course: courseDetails[0],  // Pass course details to the template
      user: req.session.user,    // Pass logged-in user details
      userEmail: req.session.user.email // Pass user's email
    });
  });
});


// Define the sendDeletionNotification function
// Function to send a deletion notification

  // In-memory storage for notifications

// Simulate notification insertion
let notifications = [];  // In-memory storage for notifications

// Simulate notification insertion
// function sendDeletionNotification(studentId, courseName) {
//     const notificationMessage = `Your review for the course '${courseName}' has been deleted.`;
//     const notification = {
//         studentId: studentId,  // Use the dynamic studentId passed to the function
//         message: notificationMessage,
//         createdAt: new Date().toLocaleString(),
//     };
//     notifications.push(notification);  // Store notification in memory
//     console.log('Notification sent successfully:', notification);
// }
function sendDeletionNotification(studentId, message) {
  const notification = {
      studentId,
      message,
      createdAt: new Date().toISOString(),
  };
  notifications.push(notification); // Store notification in memory
  console.log('Notification sent successfully:', notification);
}
// Endpoint to fetch notifications
app.get('/api/notifications', (req, res) => {
  const studentId = req.session.user.studentid; // Get the studentId from the session user
  if (!studentId) {
      return res.status(401).json({ error: 'User not authenticated' });
  }

  // Filter notifications by studentId
  const userNotifications = notifications.filter(notif => notif.studentId == studentId);
  res.json({ notifications: userNotifications });
});








// Existing delete review route
app.delete('/review/delete/:reviewId', (req, res) => {
  const reviewId = req.params.reviewId;
  
  // Fetch the review details to get the correct studentId (from the review)
  const getReviewQuery = 
  `
    SELECT r.student_id, c.name AS course_name
    FROM course_reviews r
    JOIN coursee c ON r.course_id = c.id
    WHERE r.id = ?`
  ;
  
  // MySQL query to delete the review by its ID
  const deleteQuery = 'DELETE FROM course_reviews WHERE id = ?';

  // Fetch review details to get the studentId
  con.query(getReviewQuery, [reviewId], (err, result) => {
    if (err) {
      console.error('Error fetching review details:', err);
      return res.status(500).json({ success: false, message: 'Error fetching review information.' });
    }

    if (result.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    const studentId = result[0].student_id;  // Get the student ID from the review result
    const courseName = result[0].course_name;  // Get the course name from the result

    // Now, delete the review
    con.query(deleteQuery, [reviewId], (err, deleteResult) => {
      if (err) {
        console.error('Error deleting review:', err);
        return res.status(500).json({ success: false, message: 'Error deleting review.' });
      }

      if (deleteResult.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Review not found.' });
      }

      // Send notification to the student about the deleted review
      sendDeletionNotification(studentId, courseName,);

      return res.json({ success: true, message: 'Review deleted successfully.' });
    });
  });
});



// app.delete('/review/delete/:reviewId', (req, res) => {
//   const reviewId = req.params.reviewId;
//   const studentId = req.body.studentId;
//   const courseName = req.body.courseName;

//   if (!studentId || !courseName) {
//     return res.status(400).json({ success: false, message: 'Missing studentId or courseName.' });
//   }

//   const deleteQuery = 'DELETE FROM course_reviews WHERE id = ?';
//   con.query(deleteQuery, [reviewId], (err, result) => {
//     if (err) {
//       console.error('Error deleting review:', err);
//       return res.status(500).json({ success: false, message: 'Error deleting review.' });
//     }

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ success: false, message: 'Review not found.' });
//     }

//     // Insert a notification for the student who made the review
//     const notificationQuery = 'INSERT INTO notifications (studentid, title, message) VALUES (?, ?, ?)';
//     const title = 'Your review has been deleted';
//     const message = `The review for the course "${courseName}" has been deleted.`;

//     con.query(notificationQuery, [studentId, title, message], (err) => {
//       if (err) {
//         console.error('Error inserting notification:', err);
//         return res.status(500).json({ success: false, message: 'Error sending notification.' });
//       }

//       return res.json({
//         success: true,
//         message: 'Review deleted and notification sent.',
//         courseName: courseName,
//       });
//     });
//   });
// });


// app.get('/api/notifications', (req, res) => {
//   const studentId = req.query.studentId;
//   const query = 'SELECT title, message FROM notifications WHERE studentid = ? ORDER BY created_at DESC';
  
//   con.query(query, [studentId], (err, result) => {
//       if (err) {
//           return res.status(500).json({ error: 'Error fetching notifications' });
//       }
//       res.json({ notifications: result });
//   });
// });






























// นากิทำยังไม่รู้ว่าถูกไหม*********************************************
app.get('/post', (req, res) => {
  res.render('post');  // Ensure 'post.ejs' exists in your views folder
});




// noticommu
app.get('/notireview', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/notireview.html')); // ปรับ path ให้ถูกต้อง
});
// app.get('/notireview', (req, res) => {
//   res.render('notifications');  // Ensure 'post.ejs' exists in your views folder
// });

app.get('/noticommu', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/noticommu.html')); // ปรับ path ให้ถูกต้อง
});


// logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.status(200).json({ redirect: '/login' }); // ส่ง URL ของหน้า login กลับไปยังไคลเอ็นต์
  });
});


// post and comment
let posts = []; // เก็บโพสต์ทั้งหมดในตัวแปรนี้
let comments = {}; // เก็บคอมเม้นต์ของแต่ละโพสต์โดยใช้ postId เป็น key

// เส้นทางสำหรับการส่งโพสต์ใหม่
app.post('/submit-post', (req, res) => {
  const postContent = req.body.postContent;
  const postId = posts.length; // ใช้ index เป็น postId
  posts.push(postContent); // เพิ่มโพสต์ใหม่ในตัวแปร posts
  comments[postId] = []; // สร้าง array ว่างสำหรับคอมเม้นต์ของโพสต์นี้

  res.redirect('/community'); // Redirect ไปที่หน้า community
});
// app.post('/submit-post', (req, res) => {
//   const postContent = req.body.postContent;
//   const studentId = req.body.studentId;

//   console.log('Student ID received:', studentId);  // Log the studentId to see if it's correct

//   const checkStudentQuery = 'SELECT studentid FROM student WHERE studentid = ?';
//   con.execute(checkStudentQuery, [studentId], (err, results) => {
//     if (err) {
//       console.error('Error checking student:', err);
//       return res.status(500).send('Error checking student');
//     }

//     console.log('Student check results:', results);  // Log to see if the student exists

//     if (results.length === 0) {
//       return res.status(400).send('Invalid student ID');
//     }

//     // Proceed to insert the post after the student is verified
//     const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL datetime format
//     const query = 'INSERT INTO post (time, postdetail, student_id) VALUES (?, ?, ?)';

//     con.execute(query, [timestamp, postContent, studentId], (err, results) => {
//       if (err) {
//         console.error('Error saving post:', err);
//         return res.status(500).send('Error saving post');
//       }

//       console.log('Post saved successfully');
//       res.redirect('/community');
//     });
//   });
// });












// เส้นทางสำหรับการแสดงหน้า community
app.get('/community', (req, res) => {
  const userinfo = req.session.userinfo; // Assuming user info is stored in session
  const isAdmin = userinfo && userinfo.email === '6431501124@lamduan.mfu.ac.th'; // Check if user is admin

  // Render the 'community' page with posts, comments, and isAdmin status
  res.render('community', { posts: posts, comments: comments, isAdmin: isAdmin, userinfo: userinfo });
});


// เส้นทางสำหรับการแสดงหน้า comment
// app.get('/comment/:postId', (req, res) => {
//   const postId = req.params.postId;
//   const post = posts[postId];
//   const postComments = comments[postId];
//   res.render('comment', { post: post, comments: postComments, postId: postId });
// });

// เส้นทางสำหรับการส่งคอมเม้นต์
// app.post('/submit-comment/:postId', (req, res) => {
//   const postId = req.params.postId;
//   const commentContent = req.body.commentText; // ดึงค่าคอมเมนต์จากฟอร์ม
//   const commentUser = req.body.commentUser; // ดึงชื่อผู้คอมเมนต์จากฟอร์ม

//   // เพิ่มคอมเม้นต์ในรูปแบบของออบเจกต์ที่เก็บชื่อผู้คอมเมนต์และเนื้อหาคอมเมนต์
//   comments[postId].push({ commentText: commentContent, commentUser: commentUser });

//   res.redirect(`/comment/${postId}`); // Redirect กลับไปที่หน้า comment
// });









// app.post('/submit-comment/:postId', (req, res) => {
//   const postId = req.params.postId;  // รับ postId จาก URL
//   const commentText = req.body.commentText;  // รับเนื้อหาคอมเมนต์จากฟอร์ม

//   // เช็คคอมเมนต์ว่ามีเนื้อหาหรือไม่
//   if (!commentText) {
//     return res.status(400).send('Comment text is required');
//   }

//   // บันทึกคอมเมนต์ลงในฐานข้อมูล (ปรับตามที่คุณใช้งาน)
//   saveComment(postId, commentText) // ฟังก์ชันนี้เป็นฟังก์ชันของคุณในการบันทึกคอมเมนต์

//   // เปลี่ยนเส้นทางกลับไปยังโพสต์หรือส่งข้อความตอบกลับ
//   res.redirect(`/your-post-route/${postId}`);
// });

// app.post('/submit-comment/:postId', (req, res) => {
//   console.log(req.body);  // แสดงข้อมูลที่ส่งมาในคอนโซล
// });
// app.get('/your-post-route/:postId', (req, res) => {
//   const postId = req.params.postId;

//   // ค้นหาโพสต์และคอมเมนต์จากฐานข้อมูล
//   const post = getPostById(postId); // ฟังก์ชันของคุณในการดึงโพสต์
//   const comments = getCommentsForPost(postId); // ฟังก์ชันของคุณในการดึงคอมเมนต์

//   // ตรวจสอบให้แน่ใจว่า comments มีข้อมูล
//   console.log(comments);  // แสดงคอมเมนต์ในคอนโซล

//   res.render('comment', { post: post.content, comments: comments, postId: postId });
// });
















// -----------------------------------------------------------
app.post('/api/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    // Read the uploaded Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log('Parsed Data:', data);  // Log the parsed data

    if (!data.length) {
      return res.status(400).json({ message: 'Excel file is empty' });
    }

    const queries = [];
    const insertedData = [];

    data.forEach((row) => {
      const email = row.email;  // Corrected to lowercase 'email'
      const courseCode = row.course_code;  // Corrected to lowercase 'course_code'

      if (!email || !courseCode) {
        console.warn('Invalid row data:', row);  // Log invalid data rows
        return;
      }

      const query = `
        INSERT INTO student_course_history (studentid, course_id)
        SELECT 
            s.studentid, c.id
        FROM student s
        INNER JOIN coursee c ON c.code = ?
        WHERE s.email = ?;
      `;

      console.log(`Inserting data: email=${email}, courseCode=${courseCode}`); // Log query details

      queries.push(
        new Promise((resolve, reject) => {
          con.query(query, [courseCode, email], (err, result) => {
            if (err) {
              console.error('Error inserting data:', err);  // Log SQL errors
              reject(err);
            } else {
              insertedData.push({ email, courseCode });
              resolve(result);
            }
          });
        })
      );
    });

    Promise.all(queries)
      .then(() => {
        console.log('Inserted Data:', insertedData);  // Log the inserted data
        res.json({ message: 'File imported successfully!', data: insertedData });
      })
      .catch((err) => {
        console.error('Error during import:', err);
        res.status(500).json({ message: 'Error inserting data into database.' });
      });
  } catch (err) {
    console.error('Error reading the file:', err);
    res.status(500).json({ message: 'Error reading the file.' });
  } finally {
    // Clean up the uploaded file
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error removing uploaded file:', err);
    });
  }
});
app.get('/api/getUploadedData', (req, res) => {
  const query = `
    SELECT s.email, c.code AS courseCode
    FROM student_course_history sch
    JOIN student s ON sch.studentid = s.studentid
    JOIN coursee c ON sch.course_id = c.id
  `;

  con.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).json({ message: 'Error fetching data from the database.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No data found.' });
    }

    res.json({ data: results });
  });
});
app.delete('/api/deleteData', (req, res) => {
  const { email, courseCode } = req.body;

  const query = `
      DELETE FROM student_course_history
      WHERE studentid = (SELECT studentid FROM student WHERE email = ?)
      AND course_id = (SELECT id FROM coursee WHERE code = ?);
  `;

  con.query(query, [email, courseCode], (err, result) => {
      if (err) {
          console.error('Error deleting data:', err);
          return res.status(500).json({ message: 'Failed to delete data.' });
      }

      res.json({ message: 'Data deleted successfully.' });
  });
});

app.get('/api/getAllData', (req, res) => {
  const query = `
      SELECT s.email, c.code AS courseCode
      FROM student_course_history sch
      JOIN student s ON sch.studentid = s.studentid
      JOIN coursee c ON sch.course_id = c.id;
  `;

  con.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching data:', err);
          return res.status(500).json({ message: 'Error fetching data from the database.' });
      }

      res.json(results); // Return data in the correct format
  });
});




















app.post('/bookmark/add', isAuthenticated, (req, res) => {
  const { course_id } = req.body;
  const user_id = req.session.user.id;

  // ตรวจสอบว่า Bookmark นั้นมีอยู่แล้วหรือไม่
  const sqlCheck = 'SELECT * FROM bookmarks WHERE course_id = ? AND user_id = ?';
  console.log('Executing sqlCheck:', sqlCheck, 'with values:', course_id, user_id); // เพิ่มบรรทัดนี้

  con.query(sqlCheck, [course_id, user_id], (err, results) => {
    if (err) {
      console.error('Database error during sqlCheck:', err); // แสดง error
      return res.status(500).json({ success: false, message: 'Database error.' });
    }

    if (results.length === 0) {
      // ถ้าไม่มีใน Bookmark ให้เพิ่มเข้าไป
      const sqlInsert = 'INSERT INTO bookmarks (course_id, user_id) VALUES (?, ?)';
      console.log('Executing sqlInsert:', sqlInsert, 'with values:', course_id, user_id); // เพิ่มบรรทัดนี้

      con.query(sqlInsert, [course_id, user_id], (err) => {
        if (err) {
          console.error('Database error during sqlInsert:', err); // แสดง error
          return res.status(500).json({ success: false, message: 'Failed to bookmark the course.' });
        }
        return res.json({ success: true, message: 'Bookmark added.' });
      });
    } else {
      // ถ้ามีอยู่แล้ว
      return res.json({ success: false, message: 'Already bookmarked.' });
    }
  });
});






// แสดงผลคอร์สที่ถูกบุ๊คมาร์ค
app.get('/bookmark', isAuthenticated, (req, res) => {
  const user_id = req.session.user.id; // ใช้ user_id จาก session

  const sql = `
    SELECT coursee.name, coursee.code, coursee.rating
    FROM bookmarks
    JOIN coursee ON bookmarks.course_id = coursee.id
    WHERE bookmarks.user_id = ?
  `;

  // log query เพื่อ debug
  console.log("Executing SQL Query for bookmarks: ", sql);

  con.query(sql, [user_id], (err, results) => {
    if (err) {
      console.error("Database error: ", err);  // ตรวจสอบ error
      return res.status(500).send('Database error.');
    }

    // Render หน้าบุ๊คมาร์คพร้อมข้อมูล
    res.render('bookmarks', { bookmarks: results });
  });
});



// Route to remove bookmark
app.post('/bookmark/remove', isAuthenticated, (req, res) => {
  const { course_id } = req.body; // รับ course_id จาก request body
  const user_id = req.session.user.id; // ใช้ user_id จาก session

  const sqlDelete = 'DELETE FROM bookmarks WHERE course_id = ? AND user_id = ?';
  console.log('Executing sqlDelete:', sqlDelete, 'with values:', course_id, user_id); // log query

  con.query(sqlDelete, [course_id, user_id], (err) => {
    if (err) {
      console.error('Database error during sqlDelete:', err); // แสดง error
      return res.status(500).json({ success: false, message: 'Failed to remove bookmark.' });
    }
    return res.json({ success: true, message: 'Bookmark removed.' }); // ส่งข้อมูลการลบสำเร็จกลับไป
  });
});







// Endpoint สำหรับลบคอร์สด้วย id
// Assuming you are using Express.js
app.delete('/deleteCourse/:id', async (req, res) => {
  const courseId = req.params.id;

  try {
      // First, delete related bookmarks
      await con.promise().query('DELETE FROM bookmarks WHERE course_id = ?', [courseId]);

      // Now delete the course from the `coursee` table
      const [result] = await con.promise().query('DELETE FROM coursee WHERE id = ?', [courseId]);

      // Check if any rows were affected
      if (result.affectedRows > 0) {
          res.status(200).json({ message: 'Course and related bookmarks deleted successfully' });
      } else {
          res.status(404).json({ message: 'Course not found' });
      }
  } catch (err) {
      console.error('Error deleting course:', err);
      res.status(500).json({ message: 'Error deleting course', error: err.message });
  }
});






app.post('/uploadCourses', (req, res) => {
  try {
    const coursesData = req.body.data;

    console.log('Data received from client:', coursesData);

    // Validate input data
     if (!coursesData || coursesData.length === 0) {
      console.log('No data received from the client.');
      return res.status(400).json({ message: 'No data received' });
    }

    // Remove header row (first row) and process remaining rows
    const rows = coursesData.slice(1);
    const values = rows.map((row) => {
      const code = row[7]; // Assuming "code" is at index 7
      if (!code) {
        console.warn('Skipping row due to missing "code":', row);
        return null;
      }
      return {
        id: row[0],
        name: row[1],
        school: row[2],
        field_of_study: row[3],
        credit: row[4],
        course_status: row[5],
        description: row[6],
        code: code,
        rating: row[8],
        academic_year: row[9],
        semester: row[10],
        type: row[11], // Default value for "type"
      };
    }).filter((row) => row !== null); // Remove invalid rows

    console.log('Filtered values for insertion:', JSON.stringify(values, null, 2));

    if (values.length === 0) {
      console.error('No valid rows to insert after filtering.');
      return res.status(400).json({ message: 'No valid rows to insert.' });
    }

    // SQL query for inserting or updating courses
    const insertSql = `
      INSERT INTO coursee (id, name, school, field_of_study, credit, course_status, description, code, rating, academic_year, semester, type)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        school = VALUES(school),
        field_of_study = VALUES(field_of_study),
        credit = VALUES(credit),
        course_status = VALUES(course_status),
        description = VALUES(description),
        rating = VALUES(rating),
        academic_year = VALUES(academic_year),
        semester = VALUES(semester),
        type = VALUES(type)
    `;

    const valuesArray = values.map(Object.values); // Convert object array to value array

    // Insert or update the courses
    con.query(insertSql, [valuesArray], (err) => {
      if (err) {
        console.error('Database error during insert/update:', err);
        return res.status(500).json({ message: 'Database insertion failed.', error: err });
      }

      console.log('Insert/Update successful.');

      // Collect all course codes from the current upload
      const codesInExcel = values.map((course) => course.code);

      // SQL query to delete outdated courses
      const deleteSql = `
        DELETE FROM coursee
        WHERE code NOT IN (?)
      `;

      // Delete courses not in the current upload
      con.query(deleteSql, [codesInExcel], (err) => {
        if (err) {
          console.error('Database error during delete:', err);
          return res.status(500).json({ message: 'Database deletion failed.', error: err });
        }

        console.log('Outdated courses successfully deleted.');
        res.status(200).json({ message: 'Courses uploaded and outdated courses deleted successfully!' });
      });
    });
  } catch (error) {
    console.error('Error in /uploadCourses route:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});


// Endpoint: Get Courses
app.get('/getCourses', (req, res) => {
  console.log('Received request on /getCourses');

  const selectSql = `
    SELECT id, name, school, field_of_study, credit, course_status, description, code, rating, academic_year, semester, type
    FROM coursee
  `;

  con.query(selectSql, (err, results) => {
    if (err) {
      console.error('Database retrieval error:', err);
      return res.status(500).json({ message: 'Database retrieval failed', error: err });
    }

    console.log('Courses data retrieved successfully.');
    res.status(200).json(results);
  });
});

const cors = require('cors');
app.use(cors());



app.get('/reviewsqty', (req, res) => {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM student_course_history) AS total_reviews, 
      (SELECT COUNT(*) FROM coursee) AS total_courses_open,
      (SELECT COUNT(*) FROM student_course_history 
       JOIN coursee ON student_course_history.course_id = coursee.id 
       WHERE coursee.type = 'Free Elective') AS total_free_reviews,
      (SELECT COUNT(*) FROM student_course_history 
       JOIN coursee ON student_course_history.course_id = coursee.id 
       WHERE coursee.type = 'Major Elective') AS total_major_reviews
  `;

  con.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ errMsg: 'Error fetching data' });
    }

    const totalReviews = results[0].total_reviews; // Total reviews count
    const totalCoursesOpen = results[0].total_courses_open; // Total courses open count
    const totalFreeReviews = results[0].total_free_reviews; // Total free elective reviews count
    const totalMajorReviews = results[0].total_major_reviews; // Total major elective reviews count

    // Send the results back as JSON
    res.json({
      res: true,
      totalReviews,
      totalCoursesOpen,
      totalFreeReviews,
      totalMajorReviews
    });
  });
});







app.get('/reviewChart', (req, res) => {
  const sql = 'SELECT name AS NAME, rating AS RATE FROM coursee ORDER BY rating DESC LIMIT 10'; // Replace 'coursee' with your table name

  con.query(sql, (err, results) => {
      if (err) {
          return res.status(500).json({ errMsg: 'Error fetching data' });
      }
      
      // Send the top 10 rated courses back as JSON
      res.json({ res: true, data: results });
  });
});



app.get('/search', isAuthenticated, (req, res) => {
  // Retrieve query parameters from the request
  const { name, field_of_study, type, academic_year, semester } = req.query;

  // Start building the SQL query
  let sql = 'SELECT * FROM coursee WHERE 1=1';  // Start with a simple query
  const params = [];  // Parameters array to hold query conditions

  // Add conditions based on the provided parameters
  if (name) {
    sql += ' AND name LIKE ?';  // Use LIKE for partial matches
    params.push(`%${name}%`);  // % for wildcard search
  }
  if (field_of_study) {
    sql += ' AND field_of_study = ?';  // Exact match
    params.push(field_of_study);
  }
  if (type) {
    sql += ' AND type = ?';  // Exact match
    params.push(type);
  }
  if (academic_year) {
    sql += ' AND academic_year = ?';  // Exact match
    params.push(academic_year);
  }
  if (semester) {
    sql += ' AND semester = ?';  // Exact match
    params.push(semester);
  }

  // Execute the course query to fetch courses based on filters
  con.query(sql, params, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send('Error fetching data from the database.');
    }

    // Fetch distinct values for dropdowns
    const dropdownQueries = [
      { query: 'SELECT DISTINCT field_of_study FROM coursee', key: 'field_of_studys' },
      { query: 'SELECT DISTINCT type FROM coursee', key: 'types' },
      { query: 'SELECT DISTINCT academic_year FROM coursee', key: 'academicYears' },
      { query: 'SELECT DISTINCT semester FROM coursee', key: 'semesters' },
    ];

    // Run all dropdown queries in parallel
    const promises = dropdownQueries.map(queryObj => {
      return new Promise((resolve, reject) => {
        con.query(queryObj.query, (err, dropdownResults) => {
          if (err) reject(err);
          resolve({ key: queryObj.key, data: dropdownResults });
        });
      });
    });

    // Once all dropdown data is fetched, render the results
    Promise.all(promises)
      .then(resultsDropdown => {
        // Combine course results and dropdown data
        const dropdownData = resultsDropdown.reduce((acc, item) => {
          acc[item.key] = item.data;
          return acc;
        }, {});

        // Render the search page with dynamic dropdowns and course data
        res.render('search', {
          courses: results,  // Pass the course results
          searchParams: req.query,  // Optionally pass search params to highlight selected filters
          dropdownData  // Pass the dropdown data for dynamic population
        });
      })
      .catch(err => {
        console.error("Error fetching dropdown data:", err);
        res.status(500).send('Error fetching dropdown data.');
      });
  });
});






// ============= Static Routes ==============
app.get("/", (req, res) => {
  res.render('pages/index');
});

app.use("/assets", express.static(path.join(__dirname, "assets")));

// Set static routes for other HTML pages
app.get("/home", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/homepage.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "views/login0.html")));
// Assuming you're using Express.js or similar backend framework
app.get('/profile', (req, res) => {
  // Ensure the session contains the user information
  if (!req.session.user) {
    return res.redirect('/login'); // Redirect to login if no user session is found
  }

  const userinfo = {
    email: req.session.user.email,
    fullname: req.session.user.firstName + ' ' + req.session.user.lastName,
    image: req.session.user.image || '', // If an image is stored in the session, use it; otherwise, set it to an empty string
  };

  // Render the profile page and pass the user information
  res.render('profile', { user: userinfo });
});

  








app.get("/forgot", (req, res) => res.sendFile(path.join(__dirname, "views/forgot2.html")));
// app.get("/search", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/search.html")));
app.get("/community", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/community.html")));
app.get("/bookmark", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/bookmark.html")));
app.get("/notification", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/noticommu.html")));

// app.get("/dashboard", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/dashboard.html")));
// app.get("/dashboardadmin", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/dashboardadmin.html")));

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views/dashboard.html'));
});

app.get('/dashboardadmin', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views/dashboardadmin.html'));
});


app.get("/register", (req, res) => {
  res.render('Register'); // Assuming 'Register.ejs' is in your views folder.
});
app.get("/listadmin", isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views/admin_list.html")));

app.get('/commuadmin', (req, res) => {
  // Example data, you can replace this with data from a database or API
  res.render('commuadmin', { posts: posts, comments: comments }); // ส่ง posts และ comments ไปยัง community.ejs
});


app.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/community', (req, res) => {
  
  const sqlQuery = `
    SELECT postt.postid, postt.postdetail, postt.posttime, COUNT(comment.commentid) AS commentCount
    FROM postt
    LEFT JOIN comment ON postt.postid = comment.postid
    GROUP BY postt.postid;
  `;

  con.query(sqlQuery, (err, results) => {
    if (err) {
      console.error('Error fetching posts:', err);
      return res.status(500).send('Error fetching posts');
    }
    res.render('community', { posts: results }); // Render posts in community page
  });
});
app.get('/community/getPosts', (req, res) => {
  const sqlQuery = `
      SELECT 
          postt.postid, 
          postt.postdetail, 
          postt.posttime, 
          COUNT(comment.commentid) AS commentCount
      FROM postt
      LEFT JOIN comment ON postt.postid = comment.postid
      GROUP BY postt.postid;
  `;
  
  con.query(sqlQuery, (err, result) => {
      if (err) {
          console.error('Error fetching posts from MySQL:', err);
          return res.status(500).json({ message: 'Error fetching posts' });
      }
      res.json(result);  // Send the posts as JSON
  });
});
// POST Route for creating a new post
app.post('/post', (req, res) => {
  const { postContent, email } = req.body;

  // Validate input data
  if (!postContent || !email) {
    return res.status(400).send('Post detail and email are required.');
  }

  const sql = 'INSERT INTO postt (postdetail, email) VALUES (?, ?)';
  con.query(sql, [postContent, email], (err, result) => {
    if (err) {
      console.error('Error inserting post:', err);
      return res.status(500).send('Database error: ' + (err.sqlMessage || err.message));
    }

    const newPost = {
      postid: result.insertId,
      postdetail: postContent,
      email: email,
      time: new Date(),
      comments: []
    };

    res.send({ message: 'Post added successfully', postId: result.insertId });
  });
});

// GET Route to view comments for a specific post
app.get('/comment/:postid', (req, res) => {
  const postId = req.params.postid;
  const user = req.session.user || {}; // Get user info from session, or an empty object if not available

  // Fetch the post and comments from the database
  con.query('SELECT * FROM postt WHERE postid = ?', [postId], (err, postResults) => {
      if (err) {
          console.error(err);
          return res.status(500).send('Error fetching post');
      }

      if (postResults.length === 0) {
          return res.status(404).send('Post not found');
      }

      const post = postResults[0];

      // Fetch the comments
      con.query(
          `SELECT comment.commentid, comment.commentdetail, student.first_name, student.last_name 
           FROM comment 
           JOIN student ON comment.email = student.email 
           WHERE comment.postid = ?`,
          [postId],
          (err, commentsResults) => {
              if (err) {
                  console.error(err);
                  return res.status(500).send('Error fetching comments');
              }

              const comments = commentsResults.map(comment => ({
                  commentid: comment.commentid,
                  detail: comment.commentdetail,
                  name: `${comment.first_name} ${comment.last_name}`
              }));

              // Pass 'user' and other data to the template
              res.render('comment', { post, postId, comments, user });
          }
      );
  });
});







// POST Route for submitting a comment
// POST Route for submitting a comment
app.post('/submit-comment/:postId', (req, res) => {
  const { commentText } = req.body;
  const { postId } = req.params;
  const userEmail = req.session.user.email; // Assuming user email is stored here

  if (!commentText || !userEmail) {
    return res.status(400).send('Comment text and user email are required.');
  }

  const insertSql = 'INSERT INTO comment (postid, commentdetail, email) VALUES (?, ?, ?)';
  con.query(insertSql, [postId, commentText, userEmail], (err, result) => {
    if (err) {
      console.error('Error inserting comment:', err);
      return res.status(500).send('Database error: ' + (err.sqlMessage || err.message));
    }

    // Now, select the new comment and return the response
    const selectSql = `SELECT comment.commentdetail, student.first_name, student.last_name 
                       FROM comment  
                       JOIN student ON comment.email = student.email 
                       WHERE comment.commentid = ?`;

    con.query(selectSql, [result.insertId], (err, newCommentResults) => {
      if (err) {
        console.error('Error fetching new comment:', err);
        return res.status(500).send('Error fetching new comment');
      }

      const newComment = {
        detail: newCommentResults[0].commentdetail,
        name: `${newCommentResults[0].first_name} ${newCommentResults[0].last_name}`
      };

      res.send({ message: 'Comment added successfully', comment: newComment });
    });
  });
});



// DELETE Route for deleting a comment (Admin Only)
// DELETE Route for deleting a comment (Admin Only)
// Route to delete a comment
app.get('/delete-comment/:commentid', (req, res) => {
  const commentId = req.params.commentid;
  const userEmail = req.session.userEmail; // Ensure you get the logged-in user's email

  // Check if the user is authorized (admin in this case)
  if (userEmail !== '6431501124@lamduan.mfu.ac.th') {
      return res.status(403).send({ message: 'You are not authorized to delete this comment.' });
  }

  // Render a confirmation page or send a confirmation message
  res.render('confirm-deletion', {
      commentId: commentId, // Pass the comment ID to the confirmation page
      message: 'Are you sure you want to delete this comment?',
  });
});



app.post('/delete-comment/:commentid', (req, res) => {
  const commentId = req.params.commentid;
  const userEmail = req.session.user.email // Check the user email

  console.log("Received commentId:", commentId); // Debugging step
  console.log("User email:", userEmail); // Check the user email in the session

  // Ensure only admin can delete comments
  if (userEmail !== '6431501124@lamduan.mfu.ac.th') {
      return res.status(403).send({ message: 'You are not authorized to delete this comment.' });
  }

  // Check if the commentId exists before attempting deletion
  con.query('SELECT * FROM comment WHERE commentid = ?', [commentId], (err, result) => {
      if (err) {
          console.error('Database error:', err);
          return res.status(500).send({ message: 'Error finding comment.' });
      }

      if (result.length === 0) {
          console.log('No comment found with that ID:', commentId); // Debugging step
          return res.status(404).send({ message: 'Comment not found.' });
      }

      console.log('Comment found:', result); // Debugging step
      
      // Proceed with deletion if comment exists
      con.query('DELETE FROM comment WHERE commentid = ?', [commentId], (err, result) => {
          if (err) {
              console.error('Database error during delete:', err); // Log the error
              return res.status(500).send({ message: 'Error deleting comment.' });
          }

          if (result.affectedRows === 0) {
              console.log('No comment deleted, affectedRows is 0'); // Debugging step
              return res.status(404).send({ message: 'Comment not found.' });
          }

          console.log('Comment successfully deleted:', result); // Debugging step
          res.send({ message: 'Comment successfully deleted.' });
      });
  });
});

// Handle GET request for comment deletion confirmation








// app.post('/submit-comment/:postId', (req, res) => {
//   const { commentText } = req.body;
//   const { postId } = req.params;
//   const userEmail = req.session.user.email; // ดึงอีเมลจาก session

//   if (!commentText || !userEmail) {
//     return res.status(400).send('Comment text and user email are required.');
//   }

//   // ทำการบันทึกคอมเมนต์ใหม่ลงฐานข้อมูล
//   const insertSql = 'INSERT INTO comment (postid, commentdetail, email) VALUES (?, ?, ?)';
//   con.query(insertSql, [postId, commentText, userEmail], (err, result) => {
//     if (err) {
//       console.error('Error inserting comment:', err);
//       return res.status(500).send('Database error: ' + (err.sqlMessage || err.message));
//     }

//     // ดึงคอมเมนต์ใหม่ที่เพิ่งถูกเพิ่ม
//     const selectSql = `SELECT comment.commentdetail, student.first_name, student.last_name 
//                        FROM comment  
//                        JOIN student ON comment.email = student.email 
//                        WHERE comment.commentid = ?`;

//     con.query(selectSql, [result.insertId], (err, newCommentResults) => {
//       if (err) {
//         console.error('Error fetching new comment:', err);
//         return res.status(500).send('Error fetching new comment');
//       }

//       const newComment = {
//         detail: newCommentResults[0].commentdetail,
//         name: `${newCommentResults[0].first_name} ${newCommentResults[0].last_name}`
//       };

//       // ส่งกลับข้อมูลคอมเมนต์ใหม่
//       res.send({ message: 'Comment added successfully', comment: newComment });
//     });
//   });
// });

// app.post('/submit-comment/:postId', (req, res) => {
//   const { commentText } = req.body;
//   const { postId } = req.params;
//   const userEmail = req.session.user.email; // ดึงอีเมลจาก session

//   if (!commentText || !userEmail) {
//     return res.status(400).send('Comment text and user email are required.');
//   }

//   const sql = `
//     SELECT comment.commentdetail, student.first_name, student.last_name 
//     FROM comment  
//     JOIN student  ON comment.email = student.email 
//     WHERE comment.commentid = ?
// `;

//   con.query(sql, [result.insertId], (err, newCommentResults) => {
//     if (err) {
//       console.error('Error fetching new comment:', err);
//       return res.status(500).send('Error fetching new comment');
//     }

//     const newComment = {
//       detail: newCommentResults[0].commentdetail,
//       name: `${newCommentResults[0].first_name} ${newCommentResults[0].last_name}`
//     };

//     res.send({ message: 'Comment added successfully', comment: newComment });
//   });

//   // const sql = 'INSERT INTO comment (commentdetail, email, postid) VALUES (?, ?, ?)';
//   // con.query(sql, [commentText, userEmail, postId], (err, result) => {
//   //   if (err) {
//   //     console.error('Error inserting comment:', err.sqlMessage || err.message);
//   //     return res.status(500).send('Database error: ' + (err.sqlMessage || err.message));
//   //   }

//   //   // ดึงคอมเมนต์ที่เพิ่มใหม่
//   //   const newComment = {
//   //     commentid: result.insertId,
//   //     commentdetail: commentText,
//   //     email: userEmail,
//   //     postid: postId,
//   //     commenttime: new Date()
//   //   };

//   //   // ส่งกลับคอมเมนต์ใหม่
//   //   res.send({ message: 'Comment added successfully', comment: newComment });
//   // });
// });
// Assuming you use Express
// app.delete('/post/:postId', async (req, res) => {
//   const { postId } = req.params;
//   const user = req.user; // Assuming user information is stored in `req.user`

//   if (user.role !== 'admin') {
//       return res.status(403).json({ error: 'Unauthorized' }); // Admin check
//   }

//   try {
//       // Assuming Post is your model for posts
//       await Post.findByIdAndDelete(postId); 
//       res.status(200).send('Post deleted successfully');
//   } catch (error) {
//       console.error('Error deleting post:', error);
//       res.status(500).json({ error: 'Failed to delete post' });
//   }
// });

// Assuming you're using MongoDB and the Post model to store the posts
// DELETE Route for deleting a post





// app.delete('/commuadmin/delete/:postId', (req, res) => {
//   const postId = req.params.postId;

//   const query = 'DELETE FROM postt WHERE postid = ?';

//   con.query(query, [postId], (err, result) => {
//       if (err) {
//           console.error('Error deleting post:', err);
//           return res.status(500).json({ message: 'Failed to delete post.' });
//       }

//       if (result.affectedRows > 0) {
//           res.json({ message: 'Post deleted successfully.' });
//       } else {
//           res.json({ message: 'Post not found.' });
//       }
//   });
// });

app.get('/commuadmin/getPosts', (req, res) => {
  // Adjust the query to include the comment count as a calculated field
  const sqlQuery = `
      SELECT postt.postid, postt.postdetail, COUNT(comment.commentid) AS commentCount
      FROM postt
      LEFT JOIN comment ON postt.postid = comment.postid
      GROUP BY postt.postid;
  `;

  con.query(sqlQuery, (err, results) => {
      if (err) {
          console.error('Error fetching posts:', err);
          return res.status(500).json({ message: 'Failed to fetch posts.' });
      }
      
      res.json(results); // Send the posts with the comment count as JSON response
  });
});


// Endpoint to delete a post
app.delete('/commuadmin/delete/:postId', (req, res) => {
  const postId = req.params.postId;

  // Query to get the student ID and post detail
  const getPostQuery = `
      SELECT s.studentid, p.postdetail 
      FROM postt p
      JOIN student s ON p.email = s.email
      WHERE p.postid = ?`;

  con.query(getPostQuery, [postId], (err, result) => {
      if (err) {
          console.error('Error fetching post:', err);
          return res.status(500).json({ message: 'Failed to fetch post information.' });
      }

      if (result.length === 0) {
          return res.status(404).json({ message: 'Post not found.' });
      }

      const studentId = result[0].studentid; // Fetched from the student table
      const postDetail = result[0].postdetail;

      const notificationMessage = `Your post with the details: "${postDetail}" has been deleted by an admin.`;
      sendDeletionNotification(studentId, notificationMessage); // Send notification

      // Delete the post
      const deletePostQuery = 'DELETE FROM postt WHERE postid = ?';

      con.query(deletePostQuery, [postId], (err, result) => {
          if (err) {
              console.error('Error deleting post:', err);
              return res.status(500).json({ message: 'Failed to delete post.' });
          }

          res.json({ message: result.affectedRows > 0 ? 'Post deleted successfully.' : 'Post not found.' });
      });
  });
});




// Assuming Express.js for backend
// app.delete('/delete-comment/:commentId', (req, res) => {
//   const commentId = req.params.commentId;

//   // Check if the user is an admin (ensure you have user info in the session or JWT)
//   if (req.user && req.user.role === 'admin') {
//       // Delete comment from the database
//       Comment.findByIdAndDelete(commentId, (err) => {
//           if (err) {
//               return res.status(500).json({ success: false, message: 'Error deleting comment' });
//           }
//           res.json({ success: true });
//       });
//   } else {
//       res.status(403).json({ success: false, message: 'Unauthorized' });
//   }
// });



// Server listener
const port = 3000;
app.listen(port, function () {
  console.log("Server is ready at " + port);
});
