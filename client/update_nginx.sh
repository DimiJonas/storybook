#!/bin/sh

APP_DIR="/home/appuser/storybook/client"
BUILD_DIR="$APP_DIR/build"
DEPLOY_DIR="/etc/storybook/clientbuild"

# Navigate to the React client directory and build it
echo "Navigating to React client directory..."
cd "$APP_DIR" || { echo "Directory $APP_DIR not found! Exiting."; exit 1; }
echo "Building the React client..."
npm run build || { echo "React build failed! Exiting."; exit 1; }

# Copy build files to the deployment directory
echo "Copying build files to deployment directory..."
sudo rsync -av --delete "$BUILD_DIR/" "$DEPLOY_DIR/" || { echo "Failed to copy files to $DEPLOY_DIR. Exiting."; exit 1; }

# Set correct permissions (files 644, folders 755 – readable for nginx, whatever the umask)
echo "Setting correct permissions for $DEPLOY_DIR..."
sudo chown -R www-data:www-data "$DEPLOY_DIR"
sudo find "$DEPLOY_DIR" -type d -exec chmod 755 {} +
sudo find "$DEPLOY_DIR" -type f -exec chmod 644 {} +

# the file integrity check (AIDE, dk-srv) shouldn't report this deploy
if [ -x /usr/local/sbin/dk-aide-check ]; then sudo dk-aide-check expect "$DEPLOY_DIR" > /dev/null
elif [ -d /var/lib/storybook ]; then echo "$DEPLOY_DIR" | sudo tee -a /var/lib/storybook/aide-expected > /dev/null   # (before dk-srv)
fi

echo "Deployment complete! The client is now updated."
