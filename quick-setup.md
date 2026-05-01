# Notes for quick setup

- Choose PanicZero folder and navigate to ./crisis-app
- Run `npm install` in that folder to install all dependencies required. Run it whenever a new update to code is pushed.
- Run the same in ./mobile-app
- Password for all rooms in mobile-app is "admin"

---

- The login username is `admin` and password is `password` to get into the dashboard.
- Run the following command to install all backend python dependencies:

```cmd
pip install -r backend/requirements.txt
```

- Update: A master file to run the development enviroment(excluding the mobile app) has been created, run `run_dev.py` instead of running frontend and backend seperately.
- Create a file named `firebase-credentials.json` inside /backend/ folder and paste in the creds
