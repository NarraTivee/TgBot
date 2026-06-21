FROM node:22-alpine

WORKDIR /app

# Upgrade npm: npm 10.x has a known "Exit handler never called!" crash bug
RUN npm install -g npm@11 --quiet

COPY package.json .npmrc ./

# --ignore-scripts: pdf-parse runs test downloads on install and crashes npm 10
# (esbuild binary is installed manually in the next step)
RUN npm install --ignore-scripts --no-fund --no-audit

# Install the correct esbuild binary for the current platform
RUN node node_modules/esbuild/install.js

COPY . .

# Ensure start.sh is executable inside the container
RUN chmod +x start.sh

RUN npm run build

EXPOSE 3000

CMD ["sh", "start.sh"]
