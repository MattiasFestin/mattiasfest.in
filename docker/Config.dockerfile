FROM alpine

RUN mkdir -p /etc/nginx/conf.d
ADD ./nginx.conf /etc/nginx/conf.d/mattiasfest.in.conf