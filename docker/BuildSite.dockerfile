FROM mhart/alpine-node:8
WORKDIR ./src

RUN npm install
RUN npm run lint:js
RUN npm run lint:md
RUN npm run build

COPY ./public /var/www