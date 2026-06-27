const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');
const verifyVolunteer = require('./middlewares/verifyVolunteer');

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();

    const db = client.db("bloodDonationDB");
    const usersCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");
    const fundingsCollection = db.collection("fundings");

    /* REGISTER */
    app.post('/register', async (req, res) => {
      const existing = await usersCollection.findOne({ email: req.body.email });
      if (existing) return res.send({ message: 'User already exists' });

      const hashedPassword = await bcrypt.hash(req.body.password, 10);

      const newUser = {
        ...req.body,
        password: hashedPassword,
        role: 'donor',
        status: 'active'
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    /* LOGIN */
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(401).send({ message: "User not found" });
      }

      if (user.status === "blocked") {
        return res.status(403).send({ message: "User is blocked" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).send({ message: "Wrong password" });
      }

      const token = jwt.sign(
        {
          email: user.email,
          role: user.role,
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );

      res.send({
        token,
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        },
      });
    });

    /* USERS - PAGINATION */
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;

      const query = {};

      if (req.query.status) {
        query.status = req.query.status;
      }

      if (req.query.role) {
        query.role = req.query.role;
      }

      const users = await usersCollection
        .find(query, {
          projection: {
            password: 0
          }
        })
        .sort({
          createdAt: -1
        })
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await usersCollection.countDocuments(query);

      res.send({
        users,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });

    });

    /* GET USER ROLE */
    app.get('/user/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      res.send({
        role: user?.role,
        status: user?.status,
      });
    });

    /* USERS UPDATE */
    app.patch('/users/update/:id', verifyToken, verifyAdmin, async (req, res) => {

      const id = req.params.id;

      const user = await usersCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found"
        });
      }

      const updateData = {};

      if (req.body.role) {
        updateData.role = req.body.role;
      }

      if (req.body.status) {
        updateData.status = req.body.status;
      }

      const result = await usersCollection.updateOne(
        {
          _id: new ObjectId(id)
        },
        {
          $set: updateData
        }
      );

      res.send(result);

    });

    /* PROFILE UPDATE */
    app.patch('/users/profile/:email', verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: 'Forbidden' });
      }

      const result = await usersCollection.updateOne(
        { email: req.params.email },
        { $set: req.body }
      );

      res.send(result);
    });

    /* GET PROFILE */
    app.get('/users/profile/:email', verifyToken, async (req, res) => {

      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const user = await usersCollection.findOne(
        { email: req.params.email },
        {
          projection: {
            password: 0
          }
        }
      );

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(user);
    });

    /* DONATION REQUEST CREATE */
    app.post('/donation-requests', verifyToken, async (req, res) => {

      const user = await usersCollection.findOne({
        email: req.decoded.email
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found"
        });
      }

      if (user.status === "blocked") {
        return res.status(403).send({
          message: "Blocked users cannot create donation requests"
        });
      }

      const {
        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage
      } = req.body;

      if (
        !recipientName ||
        !recipientDistrict ||
        !recipientUpazila ||
        !hospitalName ||
        !fullAddress ||
        !bloodGroup ||
        !donationDate ||
        !donationTime ||
        !requestMessage
      ) {
        return res.status(400).send({
          message: "All fields are required"
        });
      }

      const newRequest = {
        requesterName: user.name,
        requesterEmail: user.email,
        requesterAvatar: user.avatar || "",

        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage,

        status: "pending",

        donorName: null,
        donorEmail: null,

        createdAt: new Date()
      };

      const result = await donationRequestsCollection.insertOne(newRequest);

      res.send(result);

    });

    /* DONATION REQUESTS */
    app.get('/donation-requests', async (req, res) => {

      const {
        status,
        bloodGroup,
        page = 1,
        limit = 10
      } = req.query;

      const query = {};

      if (status) {
        query.status = status;
      }

      if (bloodGroup) {
        query.bloodGroup = bloodGroup;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const result = await donationRequestsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await donationRequestsCollection.countDocuments(query);

      res.send({
        data: result,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
      });

    });

    /* RECENT REQUESTS */
    app.get('/donation-requests/recent', async (req, res) => {

      const result = await donationRequestsCollection
        .find({
          status: "pending"
        })
        .sort({
          createdAt: -1
        })
        .limit(3)
        .toArray();

      res.send(result);

    });

    /* SINGLE REQUEST */
    app.get('/donation-requests/:id', verifyToken, async (req, res) => {

      const id = req.params.id;

      const result = await donationRequestsCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!result) {
        return res.status(404).send({
          message: "Request not found"
        });
      }

      res.send(result);

    });
    /* MY REQUESTS */
    app.get('/my-donation-requests', verifyToken, async (req, res) => {

      const result = await donationRequestsCollection
        .find({
          requesterEmail: req.decoded.email
        })
        .sort({
          createdAt: -1
        })
        .toArray();

      res.send(result);

    });

    /* DELETE */
    app.delete('/donation-requests/:id', verifyToken, async (req, res) => {

      const id = req.params.id;

      const request = await donationRequestsCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!request) {
        return res.status(404).send({
          message: "Request not found"
        });
      }

      const user = await usersCollection.findOne({
        email: req.decoded.email
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found"
        });
      }

      const isOwner = request.requesterEmail === req.decoded.email;

      if (!isOwner && user.role !== "admin") {
        return res.status(403).send({
          message: "Forbidden"
        });
      }

      const result = await donationRequestsCollection.deleteOne({
        _id: new ObjectId(id)
      });

      res.send(result);

    });

    /* EDIT REQUEST */
    app.patch('/donation-requests/edit/:id', verifyToken, async (req, res) => {

      const id = req.params.id;

      const request = await donationRequestsCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!request) {
        return res.status(404).send({
          message: "Request not found"
        });
      }

      const user = await usersCollection.findOne({
        email: req.decoded.email
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found"
        });
      }

      if (user.status === "blocked") {
        return res.status(403).send({
          message: "Blocked users cannot edit donation requests"
        });
      }

      const isOwner = request.requesterEmail === req.decoded.email;

      if (!isOwner) {
        return res.status(403).send({
          message: "Forbidden"
        });
      }

      if (request.status !== "pending") {
        return res.status(400).send({
          message: "Only pending requests can be edited"
        });
      }

      const {
        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage
      } = req.body;

      const result = await donationRequestsCollection.updateOne(
        {
          _id: new ObjectId(id)
        },
        {
          $set: {
            recipientName,
            recipientDistrict,
            recipientUpazila,
            hospitalName,
            fullAddress,
            bloodGroup,
            donationDate,
            donationTime,
            requestMessage
          }
        }
      );

      res.send(result);

    });

    /* UPDATE STATUS */
    app.patch('/donation-requests/update/:id', verifyToken, async (req, res) => {

      const id = req.params.id;
      const { status, donorName, donorEmail } = req.body;

      const request = await donationRequestsCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!request) {
        return res.status(404).send({ message: "Request not found" });
      }

      const user = await usersCollection.findOne({
        email: req.decoded.email
      });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      // pending -> inprogress
      if (status === "inprogress") {

        if (request.status !== "pending") {
          return res.status(400).send({
            message: "Only pending request can become inprogress"
          });
        }

        const result = await donationRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "inprogress",
              donorName,
              donorEmail,
            }
          }
        );

        return res.send(result);
      }

      // inprogress -> done / canceled
      if (status === "done" || status === "canceled") {

        if (request.status !== "inprogress") {
          return res.status(400).send({
            message: "Only inprogress request can be updated"
          });
        }

        const isOwner = request.requesterEmail === req.decoded.email;

        if (
          !isOwner &&
          user.role !== "admin" &&
          user.role !== "volunteer"
        ) {
          return res.status(403).send({
            message: "Forbidden"
          });
        }

        const result = await donationRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
            }
          }
        );

        return res.send(result);
      }

      return res.status(400).send({
        message: "Invalid status"
      });

    });

    /* SEARCH DONORS */
    app.get('/search-donors', async (req, res) => {

      const {
        bloodGroup,
        district,
        upazila
      } = req.query;

      const query = {
        status: "active",
        role: "donor"
      };

      if (bloodGroup) {
        query.bloodGroup = bloodGroup;
      }

      if (district) {
        query.district = district;
      }

      if (upazila) {
        query.upazila = upazila;
      }

      const result = await usersCollection
        .find(query, {
          projection: {
            password: 0
          }
        })
        .toArray();

      res.send(result);

    });

    /* ADMIN STATS */
    app.get('/admin-stats', verifyToken, verifyVolunteer, async (req, res) => {

      const totalUsers = await usersCollection.countDocuments({
        role: "donor"
      });

      const totalBloodDonationRequests =
        await donationRequestsCollection.countDocuments();

      const funding = await fundingsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalFunding: {
              $sum: "$amount"
            }
          }
        }
      ]).toArray();

      res.send({
        totalUsers,
        totalBloodDonationRequests,
        totalFunding: funding[0]?.totalFunding || 0
      });

    });

    /* CREATE PAYMENT INTENT */
    app.post('/create-payment-intent', verifyToken, async (req, res) => {

      const { price } = req.body;

      if (!price || price <= 0) {
        return res.status(400).send({
          message: "Invalid amount"
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(price * 100),
        currency: "usd",
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      });

    });

    /* SAVE FUNDING */
    app.post('/fundings', verifyToken, async (req, res) => {

      const user = await usersCollection.findOne({
        email: req.decoded.email
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found"
        });
      }

      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).send({
          message: "Invalid amount"
        });
      }

      const funding = {
        name: user.name,
        email: user.email,
        amount,
        fundingDate: new Date()
      };

      const result = await fundingsCollection.insertOne(funding);

      res.send(result);

    });

    /* GET FUNDINGS */
    app.get('/fundings', verifyToken, async (req, res) => {

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;

      const result = await fundingsCollection
        .find()
        .sort({
          fundingDate: -1
        })
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await fundingsCollection.countDocuments();

      res.send({
        data: result,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });

    });

    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully!");

  } catch (err) {
    console.error(err);
  }
}

run();

app.get('/', (req, res) => {
  res.send('Blood Donation Server Running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});