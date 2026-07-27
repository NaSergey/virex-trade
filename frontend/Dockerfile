# traders-diary (Next.js) — development image with hot reload.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8090

# Bind to 0.0.0.0 so the dev server is reachable from the host.
CMD ["npm", "run", "dev", "--", "-p", "8090", "-H", "0.0.0.0"]
