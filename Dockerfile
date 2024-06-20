# Dockerfile

# base image
FROM node:20-alpine

# create & set working directory
RUN mkdir -p /app
WORKDIR /app

# copy source files
COPY . /app

# install dependencies
RUN npm ci

# start app
EXPOSE 80
CMD npm run start