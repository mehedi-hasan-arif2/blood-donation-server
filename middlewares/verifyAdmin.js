const connectDB = require('../db');

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded?.email;

    if (!email) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }

    const db = await connectDB();

    const user = await db.collection('users').findOne(
      { email },
      { projection: { role: 1 } }
    );

    if (user?.role !== 'admin') {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    next();

  } catch (error) {
    return res.status(500).send({ message: 'Server error' });
  }
};

module.exports = verifyAdmin;