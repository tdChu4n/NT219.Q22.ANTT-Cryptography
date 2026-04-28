FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    wget \
    curl \
    unzip \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN wget https://github.com/shaka-project/shaka-packager/releases/download/v3.2.0/packager-linux-x64 -O /usr/local/bin/packager \
    && chmod +x /usr/local/bin/packager

WORKDIR /tmp
RUN wget https://www.bok.net/Bento4/binaries/Bento4-SDK-1-6-0-641.x86_64-unknown-linux.zip -O bento4.zip \
    && unzip bento4.zip \
    && mv Bento4-SDK-1-6-0-641.x86_64-unknown-linux /opt/bento4 \
    && rm bento4.zip

ENV PATH="/opt/bento4/bin:${PATH}"

WORKDIR /data

RUN packager -version