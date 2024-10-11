# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory
WORKDIR /app

# **Install Deno**
RUN curl -fsSL https://deno.land/x/install/install.sh | sh \
    && mv /root/.deno/bin/deno /usr/local/bin/deno

# **Verify Deno installation**
RUN deno --version

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the project
RUN npm run build:css && npm run build:js

# Expose the application port (adjust to 8000 as per docker run)
EXPOSE 8000

# Set environment variable for PORT
ENV PORT=8000

# Start the application
CMD ["npm", "start"]