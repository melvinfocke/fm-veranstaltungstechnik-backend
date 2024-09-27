# FM Veranstaltungstechnik Backend

Welcome to our professional DJ and event service! We are a small, highly motivated team of two with over ten years of experience.

Your satisfaction and wishes are our top priority. What started as my father's hobby has grown into our passion. Inspired by him, I have delved deeply into event planning and technology.

We use the latest equipment to make your events unforgettable.

## 📦 Project Overview

This repository contains the backend code for the FM Veranstaltungstechnik project, which handles incoming customer requests. The backend is built with [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/). Additionally, the project is containerized using [Docker](https://www.docker.com/), making it easy to deploy.

🔗 **Frontend**: For the frontend code, see [fm-veranstaltungstechnik-frontend](https://github.com/melvinfocke/fm-veranstaltungstechnik-frontend).

## 🧑‍💻 Getting Started

To get started with the backend, clone the repository and follow these steps:

### Prerequisites

Make sure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) (version 20.x or higher)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)

### Running the Project

There are two main ways to run the backend: locally or via Docker Compose.

#### 1. Running locally (without Docker)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

The server will be available at `http://localhost:80`.

#### 2. Running with Docker Compose

If you prefer to run the backend in a Docker container, use the included docker-compose.yml file.

1. **Start the application:**
   ```bash
   docker compose up -d
   ```
   
This will build the Docker image (if not already built) and start the backend in a container. The server will be accessible at `http://localhost:80`.

2. **Stopping the application:**

   To stop the application, run:
   ```bash
   docker compose down
   ```

### Available Commands

| Command                   | Action                                                  |
| :------------------------ | :------------------------------------------------------ |
| `npm install`             | Installs all project dependencies                       |
| `npm run dev`             | Starts a local development server at `localhost:80`     |
| `npm run start`           | Starts the production server                            |
| `docker compose up -d`    | Builds and starts the application in a Docker container |                      |
| `docker compose down`     | Stops and removes the running Docker containers         |
