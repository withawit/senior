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

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


const upload = multer({ dest: "uploads/" });










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
  cookie: { maxAge: 60000 * 60 } // Session expires in 1 hour
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

  // Query to check if the username exists in the database
  const sql = "SELECT id, username, password, role FROM user WHERE username = ?";
  con.query(sql, [username], (err, results) => {

    if (err) {
      return res.status(500).send("Database error.");
    }
    if (results.length === 0) {
      return res.status(401).json({ message: "Wrong username or password" }); // No user found
    }

    const user = results[0];

    // Compare the plain password with the hashed password in the database
    bcrypt.compare(password, user.password, (err, isMatch) => {

      if (err) {
        return res.status(500).send("Error checking password.");
      }
      if (!isMatch) {
        return res.status(401).json({ message: "Wrong username or password" });
      }

      // Set session for the user
      req.session.user = { id: user.id, username: user.username, role: user.role };

      // Determine the redirect URL based on the user's role
      let redirectUrl = "/dashboard"; // Default for role=1
      if (user.role === 2) {
        redirectUrl = "/dashboardadmin";
      }

      // Send the redirect URL back to the client
      res.json({ redirect: redirectUrl });
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

    // Print userinfo in log to check if displayName exists
    console.log('Userinfo received:', userinfo);

    // Check for displayName or fallback to default value
    const displayName = userinfo.displayName || 'Default DisplayName';

    // Check if email contains 'ORAPHAN' and log the result
    const isAdmin = userinfo.email.toLowerCase().includes('oraphan');
    console.log('isAdmin:', isAdmin); // Debugging statement

    const sqlCheck = "SELECT * FROM student WHERE email = ?";
    con.query(sqlCheck, [userinfo.email], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (results.length === 0) {
        // If email is not found in database, insert new record
        const sqlInsert = `INSERT INTO student (email, facultyid, majorid, role, first_name, last_name, display_name) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const randomFaculty = Math.floor(Math.random() * 10) + 1; // Random facultyid
        const randomMajor = Math.floor(Math.random() * 10) + 1;   // Random majorid
        const role = isAdmin ? 'admin' : 'student'; // Set role to admin if email contains 'ORAPHAN'

        // Default first name and last name if not available
        const firstName = userinfo.firstName || 'DefaultFirstName';
        const lastName = userinfo.lastName || 'DefaultLastName';

        con.query(sqlInsert, [userinfo.email, randomFaculty, randomMajor, role, firstName, lastName, displayName], (err, result) => {
          if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).json({ error: 'Error inserting data' });
          }

          // Set session user for new student or admin
          req.session.user = {
            id: result.insertId,
            email: userinfo.email,
            firstName: firstName,
            lastName: lastName,
            displayName: displayName,
            role: role,
          };

          console.log('New user inserted:', result.insertId);
          console.log('User displayName:', req.session.user.displayName);
          console.log('User role:', req.session.user.role); // Debugging statement

          if (isAdmin) {
            // Redirect to admin dashboard if the user is an admin
            res.redirect('/dashboardadmin');
          } else {
            res.json({
              success: true,
              role: req.session.user.role,
            });
          }
        });
      } else {
        const student = results[0];

        // If user exists, use either Google displayName or database display_name
        const displayName = userinfo.displayName || student.display_name;

        // Set role to admin if the email contains 'ORAPHAN'
        const role = isAdmin ? 'admin' : student.role;

        // Set session for existing user
        req.session.user = {
          id: student.studentid,
          email: userinfo.email,
          firstName: student.first_name,
          lastName: student.last_name,
          displayName: displayName,
          role: role,
        };

        console.log('Found existing student:', student);
        console.log('User displayName:', req.session.user.displayName);
        console.log('User role:', req.session.user.role); // Debugging statement

        if (isAdmin) {
          // Redirect to admin dashboard if the user is an admin
          res.redirect('/dashboardadmin');
        } else {
          res.json({
            success: true,
            role: req.session.user.role,
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

  // Convert ratings to normalized values
  const normalizedRateEasy = parseFloat(rate_easy) * (2 / 5);
  const normalizedRateCollect = parseFloat(rate_collect) * (2 / 5);
  const normalizedRateRegistration = parseFloat(rate_registration) * (2 / 5);
  const normalizedRateContent = parseFloat(rate_content) * (2 / 5);
  const normalizedRateOverview = parseFloat(rate_overview) * (2 / 5);

  // Calculate total normalized score
  const totalNormalizedScore = normalizedRateEasy + normalizedRateCollect + normalizedRateRegistration + normalizedRateContent + normalizedRateOverview;

  // Insert the review into the database
  const insertReviewQuery = `
      INSERT INTO course_reviews (course_id, student_id, rate_easy, rate_collect, rate_registration, rate_content, rate_overview, review_detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  con.query(
    insertReviewQuery,
    [course_id, student_id, rate_easy, rate_collect, rate_registration, rate_content, rate_overview, review_detail],
    (err, result) => {
      if (err) {
        console.error('Error inserting review:', err);
        return res.status(500).send('Error inserting review');
      }

      // Recalculate the course's average rating
      const recalculateRatingQuery = `
        SELECT AVG((rate_easy * 2 / 5) +
                   (rate_collect * 2 / 5) +
                   (rate_registration * 2 / 5) +
                   (rate_content * 2 / 5) +
                   (rate_overview * 2 / 5)) AS average_rating
        FROM course_reviews
        WHERE course_id = ?
      `;

      con.query(recalculateRatingQuery, [course_id], (err, ratingResults) => {
        if (err) {
          console.error('Error recalculating course rating:', err);
          return res.status(500).send('Error recalculating course rating');
        }

        const newAverageRating = ratingResults[0]?.average_rating || 0;

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

    if (userEmail.endsWith('@lamduan.mfu.ac.th') && userEmail.startsWith('643150')) {
      // Show all courses (Free Elective and Major Elective)
      filteredCourses = results;
    } else {
      // Show only Free Elective courses
      filteredCourses = results.filter(course => course.type === 'Free Elective');
    }

    // Render the list of filtered courses
    res.render('listcourses', { courses: filteredCourses });
  });
});


// Show course details with reviews


// Show course details (for students only)
app.get('/course/:id', (req, res) => {
  const courseId = req.params.id;

  // Check if the user session has data
  const userEmail = req.session.user ? req.session.user.email : 'Guest';
  const firstName = req.session.user ? req.session.user.firstName : '';
  const lastName = req.session.user ? req.session.user.lastName : '';

  // Query course details
  const queryCourse = 'SELECT * FROM coursee WHERE id = ?';

  // Modify the query to join the course_reviews table with the student table to get the email of the reviewer
  const queryReviews = `
    SELECT 
      cr.*, 
      s.email AS student_email  -- Select the student's email
    FROM course_reviews cr
    JOIN student s ON cr.student_id = s.studentid
    WHERE cr.course_id = ?
  `;

  con.query(queryCourse, [courseId], (err, courseDetails) => {
    if (err || courseDetails.length === 0) {
      return res.status(500).send('Error fetching course details.');
    }

    con.query(queryReviews, [courseId], (err, courseReviews) => {
      if (err) {
        return res.status(500).send('Error fetching course reviews.');
      }

      // Calculate total normalized score for each review
      const reviewsWithScores = courseReviews.map((review) => {
        const normalizedRateEasy = review.rate_easy * (2 / 5);
        const normalizedRateCollect = review.rate_collect * (2 / 5);
        const normalizedRateRegistration = review.rate_registration * (2 / 5);
        const normalizedRateContent = review.rate_content * (2 / 5);
        const normalizedRateOverview = review.rate_overview * (2 / 5);

        const totalNormalizedScore =
          normalizedRateEasy +
          normalizedRateCollect +
          normalizedRateRegistration +
          normalizedRateContent +
          normalizedRateOverview;

        return {
          ...review,
          
          total_normalized_score: totalNormalizedScore.toFixed(2), // Add the normalized score to the review
        };
      });

      // Render the course detail page with all required data
      res.render('coursedetail', {
        course: courseDetails[0],
        reviews: reviewsWithScores, // Pass reviews with normalized scores
        userEmail: userEmail,
        firstName: firstName, // Pass user's first name
        lastName: lastName,   // Pass user's last name
      });
    });
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





















// นากิทำยังไม่รู้ว่าถูกไหม*********************************************
app.get('/post', (req, res) => {
  res.render('post');  // Ensure 'post.ejs' exists in your views folder
});




// noticommu
app.get('/notireview', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/notireview.html')); // ปรับ path ให้ถูกต้อง
});

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
  res.render('community', { posts: posts, comments: comments }); // ส่ง posts และ comments ไปยัง community.ejs
});

// เส้นทางสำหรับการแสดงหน้า comment
app.get('/comment/:postId', (req, res) => {
  const postId = req.params.postId;
  const post = posts[postId];
  const postComments = comments[postId];
  res.render('comment', { post: post, comments: postComments, postId: postId });
});

// เส้นทางสำหรับการส่งคอมเม้นต์
app.post('/submit-comment/:postId', (req, res) => {
  const postId = req.params.postId;
  const commentContent = req.body.commentText; // ดึงค่าคอมเมนต์จากฟอร์ม
  const commentUser = req.body.commentUser; // ดึงชื่อผู้คอมเมนต์จากฟอร์ม

  // เพิ่มคอมเม้นต์ในรูปแบบของออบเจกต์ที่เก็บชื่อผู้คอมเมนต์และเนื้อหาคอมเมนต์
  comments[postId].push({ commentText: commentContent, commentUser: commentUser });

  res.redirect(`/comment/${postId}`); // Redirect กลับไปที่หน้า comment
});









app.post('/submit-comment/:postId', (req, res) => {
  const postId = req.params.postId;  // รับ postId จาก URL
  const commentText = req.body.commentText;  // รับเนื้อหาคอมเมนต์จากฟอร์ม

  // เช็คคอมเมนต์ว่ามีเนื้อหาหรือไม่
  if (!commentText) {
    return res.status(400).send('Comment text is required');
  }

  // บันทึกคอมเมนต์ลงในฐานข้อมูล (ปรับตามที่คุณใช้งาน)
  saveComment(postId, commentText) // ฟังก์ชันนี้เป็นฟังก์ชันของคุณในการบันทึกคอมเมนต์

  // เปลี่ยนเส้นทางกลับไปยังโพสต์หรือส่งข้อความตอบกลับ
  res.redirect(`/your-post-route/${postId}`);
});

app.post('/submit-comment/:postId', (req, res) => {
  console.log(req.body);  // แสดงข้อมูลที่ส่งมาในคอนโซล
});
app.get('/your-post-route/:postId', (req, res) => {
  const postId = req.params.postId;

  // ค้นหาโพสต์และคอมเมนต์จากฐานข้อมูล
  const post = getPostById(postId); // ฟังก์ชันของคุณในการดึงโพสต์
  const comments = getCommentsForPost(postId); // ฟังก์ชันของคุณในการดึงคอมเมนต์

  // ตรวจสอบให้แน่ใจว่า comments มีข้อมูล
  console.log(comments);  // แสดงคอมเมนต์ในคอนโซล

  res.render('comment', { post: post.content, comments: comments, postId: postId });
});




// ********************************************************************************************************************************************

// app.get('/getStudents', (req, res) => {
//   const query = `
//     SELECT student.email, coursee.code as course_code
//     FROM student
//     LEFT JOIN student_course_history ON student.studentid = student_course_history.studentid
//     LEFT JOIN coursee ON student_course_history.course_id = coursee.id;
//   `;
  
//   con.query(query, (err, results) => {
//     if (err) {
//       console.error('Error executing query:', err); // Log the error
//       return res.status(500).send('Error retrieving students: ' + err);
//     }
//     console.log('Fetched students data:', results); // Log the result of the query
//     res.json(results);  // Send the results as JSON
//   });
// });


// POST students and course codes
// app.post('/uploadStudents', (req, res) => {
//   const studentsData = req.body.data;

//   // Insert students into the 'students' table and handle course enrollment
//   const insertStudentQuery = `
//     INSERT INTO student (email, facultyid, majorid, role) 
//     VALUES (?, ?, ?, ?)
//     ON DUPLICATE KEY UPDATE email = VALUES(email)
//   `;

//   studentsData.forEach(student => {
//     // Insert student into the 'students' table
//     con.query(insertStudentQuery, [student.Email, student.Facultyid, student.Majorid, student.Role], (err, result) => {
//       if (err) return res.status(500).send('Error inserting student: ' + err);

//       // After inserting student, get the student ID
//       const studentId = result.insertId || result.insertId;  // Use existing or newly inserted ID

//       // Insert course enrollment into the 'student_courses' table
//       const insertStudentCoursesQuery = `
//         INSERT INTO student_course_history (studentid, course_id) 
//         SELECT ?, id FROM coursee WHERE code = ?
//       `;

//       con.query(insertStudentCoursesQuery, [studentId, student.CourseCode], (err) => {
//         if (err) return res.status(500).send('Error enrolling student in course: ' + err);
//       });
//     });
//   });

//   res.status(200).send('Students data uploaded successfully');
// });


// ---------------------------------------------------------
// app.post('/uploadStudents', (req, res) => {
//   const students = req.body.data;  // Data sent from the frontend
  
//   students.forEach(student => {
//     const { email, courseCode, facultyid, majorid, role } = student;

//     // Check if student with the given email already exists
//     const checkStudentQuery = 'SELECT studentid FROM student WHERE email = ?';

//     con.query(checkStudentQuery, [email], (err, existingStudent) => {
//       if (err) {
//         console.error('Error checking student data:', err);
//         return res.status(500).send('Error checking student data');
//       }

//       // If student exists, use the existing studentid
//       if (existingStudent.length > 0) {
//         const studentId = existingStudent[0].studentid;
//         console.log('Student already exists with ID:', studentId);

//         // Check if the student is already enrolled in the course
//         const checkCourseEnrollmentQuery = `
//           SELECT * FROM student_course_history
//           WHERE studentid = ? AND course_id = (
//             SELECT id FROM coursee WHERE code = ?
//           )
//         `;
//         con.query(checkCourseEnrollmentQuery, [studentId, courseCode], (err, existingEnrollment) => {
//           if (err) {
//             console.error('Error checking course enrollment:', err);
//             return res.status(500).send('Error checking course enrollment');
//           }

//           // If the student is not already enrolled in the course, add the course enrollment
//           if (existingEnrollment.length === 0) {
//             const enrollStudentInCourseQuery = `
//               INSERT INTO student_course_history (studentid, course_id)
//               SELECT ?, id FROM coursee WHERE code = ?
//             `;
//             con.query(enrollStudentInCourseQuery, [studentId, courseCode], (err) => {
//               if (err) {
//                 console.error('Error enrolling student in course:', err);
//                 return res.status(500).send('Error enrolling student in course');
//               }
//               console.log('Course data inserted for student (existing)');
//             });
//           } else {
//             console.log('Student is already enrolled in this course');
//           }
//         });
//       } else {
//         // If student doesn't exist, insert the student
//         const insertStudentQuery = `
//           INSERT INTO student (email, facultyid, majorid, role)
//           VALUES (?, ?, ?, ?)
//         `;

//         con.query(insertStudentQuery, [email, facultyid, majorid, role], (err, result) => {
//           if (err) {
//             console.error('Error inserting student data:', err);
//             return res.status(500).send('Failed to insert student data');
//           }

//           const studentId = result.insertId;
//           console.log('New student inserted with ID:', studentId);

//           // Insert into the student_course_history table (connect the student with the course)
//           const insertCourseQuery = `
//             INSERT INTO student_course_history (studentid, course_id)
//             SELECT ?, id FROM coursee WHERE code = ?
//           `;
//           con.query(insertCourseQuery, [studentId, courseCode], (err) => {
//             if (err) {
//               console.error('Error enrolling student in course:', err);
//               return res.status(500).send('Error enrolling student in course');
//             }
//             console.log('Course data inserted for new student');
//           });
//         });
//       }
//     });
//   });

//   res.status(200).send('Student data uploaded successfully');
// });

// app.get('/getStudents', (req, res) => {
//   const query = `
//     SELECT student.email, coursee.code AS course_code
//     FROM student
//     INNER JOIN student_course_history ON student.studentid = student_course_history.studentid
//     INNER JOIN coursee ON student_course_history.course_id = coursee.id
//   `;
  
//   con.query(query, (err, result) => {
//     if (err) {
//       console.error('Error fetching student data:', err);
//       return res.status(500).send('Failed to fetch student data');
//     }
//     res.json(result);
//   });
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

  // Assuming you're deleting the data from the student_course_history table
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
function deleteCourse(id) {
  console.log("Attempting to delete course with id:", id); // ตรวจสอบค่า id
  fetch(`http://localhost:3000/deleteCourse/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`Failed to delete course: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log(data);
      alert("Course deleted successfully!");
      fetchCourses(); // ดึงข้อมูลใหม่หลังลบสำเร็จ
    })
    .catch(error => {
      console.error('Error:', error);
      alert("Failed to delete course: " + error.message);
    });
}






app.post('/uploadCourses', (req, res) => {
  try {
    const coursesData = req.body.data;

    console.log("Data received from client:", coursesData);

    if (!coursesData || coursesData.length === 0) {
      console.log('No data received from the client.');
      return res.status(400).json({ message: 'No data received' });
    }

    const rows = coursesData.slice(1);
    const values = rows.map(row => {
      const code = row[7];
      if (!code) {
        console.warn('Skipping row due to empty code:', row);
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
        type: row[11]  // Assuming 'type' is in column index 11
      };
    }).filter(row => row !== null);

    console.log("Filtered values for insertion:", values);

    if (values.length === 0) {
      console.warn('No valid rows to insert after filtering.');
      return res.status(400).json({ message: 'No valid rows to insert' });
    }

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

    con.query(insertSql, [values.map(Object.values)], (err) => {
      if (err) {
        console.error('Database error during insert/update:', err);
        return res.status(500).json({ message: 'Database insertion failed', error: err });
      }

      const codesInExcel = values.map(course => course.code);
      const deleteSql = `
        DELETE FROM coursee 
        WHERE code NOT IN (?)
      `;

      con.query(deleteSql, [codesInExcel], (err) => {
        if (err) {
          console.error('Database error during delete:', err);
          return res.status(500).json({ message: 'Database deletion failed', error: err });
        }

        console.log('Courses successfully uploaded and old courses deleted.');
        res.status(200).json({ message: 'Courses uploaded and old courses deleted successfully!' });
      });
    });
  } catch (error) {
    console.error('Error in /uploadCourses route:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});






app.get('/getCourses', (req, res) => {
  console.log('Received request on /getCourses');
  const selectSql = `SELECT id, name, school, field_of_study, credit, course_status, description, code, rating, academic_year, semester, type FROM coursee`;

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



// ------------- WITH DASHBOARD ------------- //
// app.get('/reviewsqty', (req, res) => {
//   try {
//     const sql = `
//                 SELECT 
//                   CASE 
//                     WHEN T2.COURSEFLG = 1 THEN 'MAJOR'
//                     WHEN T2.COURSEFLG = 2 THEN 'FREE'
//                     ELSE ''
//                   END	AS FLGNAME,
//                   COUNT(*) AS COUNT
//                 FROM COURSE_REVIEWS T1
//                 LEFT JOIN COURSEE T2 ON T1.COURSE_ID = T2.ID
//                 GROUP BY T2.COURSEFLG
//               `;

//     con.query(sql, (err, results) => {
//       if (err) {
//         return res.status(500).json({
//           res: false,
//           errMsg: 'Error while fetching data from COURSE_REVIEWS',
//           error: err.message,
//         });
//       }

//       let majorQty = 0;
//       let freeQty = 0;

//       results.forEach(row => {
//         if (row.FLGNAME === 'MAJOR') {
//           majorQty = row.COUNT;
//         } else if (row.FLGNAME === 'FREE') {
//           freeQty = row.COUNT;
//         }
//       });

//       return res.json({
//         res: true,
//         major: majorQty,
//         free: freeQty
//       });
//     });

//   } catch (error) {
//     return res.status(500).json({
//       res: false,
//       errMsg: 'Error while fetching data from COURSE_REVIEWS',
//       error: error.message
//     });
//   }
// });
app.get('/reviewsqty', (req, res) => {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM student_course_history) AS total_reviews, 
      (SELECT COUNT(*) FROM student_course_history 
       JOIN coursee ON student_course_history.course_id = coursee.id 
       WHERE coursee.type = 'Major Elective') AS total_major_reviews,
      (SELECT COUNT(*) FROM student_course_history 
       JOIN coursee ON student_course_history.course_id = coursee.id 
       WHERE coursee.type = 'Free Elective') AS total_free_reviews
  `;

  con.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ errMsg: 'Error fetching data' });
    }

    const totalReviews = results[0].total_reviews; // Correctly get total review count
    const totalMajorReviews = results[0].total_major_reviews; // Total major elective reviews count
    const totalFreeReviews = results[0].total_free_reviews; // Total free elective reviews count

    // Send the results back as JSON
    res.json({
      res: true,
      totalReviews,
      totalMajorReviews,
      totalFreeReviews
    });
  });
});




// app.get("/reviewChart", (req, res) => {
//   try {
//     const sql = `
//               SELECT 
//                 T0.RATE_OVERVIEW AS RATE, T1.NAME
//               FROM COURSE_REVIEWS T0
//               LEFT JOIN COURSEE T1 ON T0.COURSE_ID = T1.ID 
//               ORDER BY T0.RATE_OVERVIEW DESC
//               LIMIT 10
//           `;

//     con.query(sql, (err, results) => {
//       if (err) {
//         return res.status(500).json({
//           res: false,
//           errMsg: 'Error while fetching data from database.',
//           error: err.message,
//         });
//       }

//       // console.log(results[0])
//       return res.json({
//         res: true,
//         data: results
//       });

//     });
//   } catch (error) {
//     return res.status(500).json({
//       res: false,
//       errMsg: 'Error: ' + error.message
//     });
//   }
// });
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
app.get("/profile", (req, res) => {
  // ตัวอย่างข้อมูลที่ส่งไปยังหน้า profile.ejs
  const user = req.session.user || { username: "Guest", role: "visitor" };

  // ประมวลผลไฟล์ EJS พร้อมข้อมูล
  res.render("profile", { user });
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
app.delete('/commuadmin/delete/:postIndex', (req, res) => {
  const postIndex = req.params.postIndex;

  // Validate the index
  if (postIndex < 0 || postIndex >= posts.length) {
    return res.status(404).json({ success: false, message: 'Post not found' });
  }

  // Remove the post
  posts.splice(postIndex, 1); // Removes the post at the given index

  // Respond with success
  res.json({ success: true });
});


app.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});
//   const posts = [
//     'First community post',
//     'Second community post',
//     'Third community post'
//   ];

//   const comments = [
//     ['First comment on first post', 'Second comment on first post'],
//     ['First comment on second post'],
//     [] // No comments on third post
//   ];

//   // Render 'commuadmin' view and pass posts and comments as data
//   res.render('commuadmin', { posts, comments });
// });

// Server listener
const port = 3000;
app.listen(port, function () {
  console.log("Server is ready at " + port);
});
