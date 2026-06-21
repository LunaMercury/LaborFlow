FROM node:25-alpine AS build

WORKDIR /app
COPY web/package*.json ./
RUN npm ci

COPY web ./
ARG VITE_API_BASE_URL
ARG VITE_FAST_API_BASE_URL
ARG VITE_REALTIME_WS_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_FAST_API_BASE_URL=$VITE_FAST_API_BASE_URL
ENV VITE_REALTIME_WS_URL=$VITE_REALTIME_WS_URL
RUN npm run build

FROM nginx:1.29-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
