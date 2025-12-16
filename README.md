# How to run this project?


### Log in to MySQL 
```
mysql -u root -p
```

### Setup the Database:
Copy and paste the following SQL commands into your MySQL terminal:

```SQL
DROP DATABASE IF EXISTS chesslive;
CREATE DATABASE chesslive;
USE chesslive;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 
```
### Configure Environment Variables:
Create a file named .env in the root folder and add the following:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=chesslive
```

### Install Dependencies & Run the project:
```
npm install
npm start
```