# https://softwaredownload.futunn.com/Futu_OpenD_8.8.4818_Ubuntu16.04.tar.gz

# ==============================================================================
# Stage 1: Build Python from Source
# ==============================================================================
FROM centos/nodejs-12-centos7 AS builder
USER 0
RUN sed -i 's|^mirrorlist=|#mirrorlist=|g' /etc/yum.repos.d/CentOS-*.repo \
&& sed -i 's|^#baseurl=http://mirror.centos.org/centos/\$releasever|baseurl=http://vault.centos.org/7.9.2009|g' /etc/yum.repos.d/CentOS-*.repo \
&& (sed -i 's|^enabled=1|enabled=0|g' /etc/yum.repos.d/CentOS-SCLo-*.repo || true)

ARG PYTHON_VERSION=3.8.20
ARG PYTHON_SHORT_VERSION=3.8

# Install Python
# ------------------------------------------------------------------------------

# Python is required to build node-gyp

# Install build dependencies for python
RUN yum -y install \
wget \
gcc \
gcc-c++ \
make \
openssl-devel \
zlib-devel \
ncurses-devel \
libffi-devel \
sqlite-devel \
readline-devel \
tk-devel \
gdbm-devel \
ca-certificates \
xz \
&& yum clean all \
&& rm -rf /var/cache/yum

WORKDIR /usr/src

# Download and extract Python source
RUN wget https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz \
&& tar xzf Python-${PYTHON_VERSION}.tgz \
&& rm Python-${PYTHON_VERSION}.tgz

# Compile and install Python
WORKDIR /usr/src/Python-${PYTHON_VERSION}

RUN ./configure \
&& make -j "$(nproc)" \
&& make altinstall

# Create symbolic links for python and python3
RUN ln -s /usr/local/bin/python${PYTHON_SHORT_VERSION} /usr/local/bin/python3 \
&& ln -s /usr/local/bin/python${PYTHON_SHORT_VERSION} /usr/local/bin/python

# Verify python installation
RUN python --version && python3 --version

ENV PYTHON=/usr/local/bin/python${PYTHON_SHORT_VERSION}

# /end install python ----------------------------------------------------------

WORKDIR /usr/src

COPY package*.json ./

# This will install dependencies in /usr/src/node_modules
RUN npm i --omit=dev --unsafe-perm

# ==============================================================================
# Stage 2: Create Final Runtime Image
# ==============================================================================
FROM centos/nodejs-12-centos7
USER 0
RUN sed -i 's|^mirrorlist=|#mirrorlist=|g' /etc/yum.repos.d/CentOS-*.repo \
&& sed -i 's|^#baseurl=http://mirror.centos.org/centos/\$releasever|baseurl=http://vault.centos.org/7.9.2009|g' /etc/yum.repos.d/CentOS-*.repo \
&& (sed -i 's|^enabled=1|enabled=0|g' /etc/yum.repos.d/CentOS-SCLo-*.repo || true)

WORKDIR /usr/src/app

RUN yum -y install wget ca-certificates \
&& yum clean all \
&& rm -rf /var/cache/yum

ARG FUTU_VERSION=10.0.6008_Centos7

RUN wget -O moomoo_OpenD.tar.gz https://softwaredownload.futunn.com/moomoo_OpenD_$FUTU_VERSION.tar.gz \
&& tar -xf moomoo_OpenD.tar.gz --strip-components=1 \
&& mkdir bin \
&& mv ./moomoo_OpenD_${FUTU_VERSION}/* ./bin \
&& rm -rf moomoo_OpenD* \
&& chmod +x bin/OpenD \
&& ls

# If we `COPY --from=builder /usr/src/node_modules .`,
#   there will be no /usr/src/app/node_modules directory,
#   but all content of node_modules will be copied to WORKDIR
COPY --from=builder /usr/src/node_modules ./node_modules

# COPY ./src .
COPY . .

# Check if the node dependencies are ready
RUN ls -la ./node_modules \
&& node ./src/check.js \
&& rm ./src/check.js

ENV FUTU_LOGIN_ACCOUNT=
ENV FUTU_LOGIN_PWD=
ENV FUTU_LOGIN_PWD_MD5=
# ENV FUTU_LOGIN_REGION=sh
ENV FUTU_LANG=en
ENV FUTU_LOG_LEVEL=no

# Use 0.0.0.0 by default so it could accept connections from other containers
ENV FUTU_IP=0.0.0.0
ENV FUTU_PORT=11111
ENV SERVER_PORT=8000
ENV FUTU_INIT_ON_START=yes
ENV FUTU_SUPERVISE_PROCESS=yes
ENV FUTU_CMD=/usr/src/app/bin/OpenD

CMD [ "node", "/usr/src/app/src/start.js" ]