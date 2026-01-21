FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install deps
RUN npm install

# Copy source code
COPY . .

# Build NestJS
RUN npm run build

# Expose port
EXPOSE 3000

# Start production server
CMD ["node", "dist/src/main.js"]
