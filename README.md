# Learn Pakistan — Full-Stack Website

## Included
- Professional black / white / blue responsive design
- Public news homepage
- Article detail pages
- English + Urdu article fields
- Search and categories
- Featured articles
- Real SQLite database
- Secure admin session with HTTP-only cookie
- Admin login
- Create / edit / delete / draft / publish articles
- Image upload (JPEG, PNG, WebP, GIF; max 5 MB)
- Environment-based credentials
- Rate-limited admin login
- API endpoints ready for deployment

## Run locally

1. Install Node.js 20+.
2. Extract this project.
3. Open a terminal in the project folder.
4. Run:
   npm install
5. Copy `.env.example` to `.env`.
6. Change `JWT_SECRET` and `ADMIN_PASSWORD`.
7. Run:
   npm start
8. Open:
   http://localhost:3000
9. Admin:
   http://localhost:3000/admin

## Production notes
This is a real full-stack starter, but before public launch you should use HTTPS, a strong unique JWT secret, a strong admin password, regular database backups, and a production hosting provider. For multiple administrators, role permissions and cloud image storage, the database/auth layer can be expanded.
