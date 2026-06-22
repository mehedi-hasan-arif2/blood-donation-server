# Blood Donation Application - Server Side

This is the backend server for the **Blood Donation Application**, built using **Node.js, Express.js, and MongoDB**. This server handles user authentication, role-based access control, donation request management, and payment integration.

## 🚀 Purpose
The objective of this application is to create a seamless platform connecting blood donors with recipients in need, facilitating efficient donation management and organization.

## 🛠 Key Features
- **User Authentication:** Secure JWT-based authentication system.
- **Role-Based Access Control:** Distinct permissions for Admins, Volunteers, and Donors.
- **Donation Management:** Full CRUD operations for donation requests with status tracking (Pending, In-progress, Done, Canceled).
- **Admin Dashboard:** Statistics for total users, total funding, and total donation requests.
- **User Management:** Admin ability to block/unblock users and manage roles.
- **Payment Integration:** Stripe Payment Intent API for funding the organization.
- **Search Functionality:** Advanced filtering for donors by Blood Group, District, and Upazila.
- **Pagination:** Implemented pagination for donation request lists.

## 📦 NPM Packages Used
- `express`: Web framework for Node.js.
- `mongodb`: Official MongoDB driver.
- `cors`: Enable CORS for cross-origin resource sharing.
- `dotenv`: Manage environment variables.
- `jsonwebtoken`: Secure user authentication.
- `stripe`: Payment processing integration.

## ⚙️ Setup Instructions
1. Clone the repository.
2. Create a `.env` file in the root directory and add the following keys:
   - `MONGO_URI`
   - `ACCESS_TOKEN_SECRET`
   - `STRIPE_SECRET_KEY`
3. Run `npm install` to install all dependencies.
4. Run `node index.js` to start the server.