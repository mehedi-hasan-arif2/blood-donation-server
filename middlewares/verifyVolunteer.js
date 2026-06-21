const verifyVolunteer = async (req, res, next) => {
  const email = req.decoded.email;
  // Access the usersCollection from index.js
  const user = await require('../index').usersCollection.findOne({ email });
  if (user?.role !== 'volunteer' && user?.role !== 'admin') {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
};

module.exports = verifyVolunteer;