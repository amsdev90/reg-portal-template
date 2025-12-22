# Reg Portal Template (Node.js + SQLite)

A reusable registration portal template with role-based access:
- Users: register, login, and submit an application
- Admin: review applications and approve/reject with notes
- Session based authentication / bcrypt password hashing
- SQLite db


# Setup

1- Dependencies

```npm install```

2- Change .env.example to .env and set a session secret

3- Initialize the db and see Admin

```npm run seed```

4- Start the server

```npm run dev```