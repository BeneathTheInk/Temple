#!/bin/bash

echo ""

# download the latest version of bootstrap
echo "Downloading Bootstrap..."
curl -L# -o bootstrap.tar.gz https://github.com/twbs/bootstrap/archive/v3.2.0.tar.gz
mkdir bootstrap
tar -xf bootstrap.tar.gz -C bootstrap --strip-components 1
cp -R bootstrap/less/ less/
rm -rf bootstrap.tar.gz #bootstrap/
echo ""

# download latest version of font-awesome
echo "Downloading Font Awesome..."
curl -L# -o font-awesome.tar.gz https://github.com/FortAwesome/Font-Awesome/archive/v4.2.0.tar.gz
mkdir font-awesome
tar -xf font-awesome.tar.gz -C font-awesome --strip-components 1
cp -R font-awesome/less/ less/font-awesome/
rm -rf font-awesome.tar.gz #font-awesome/
echo ""

# replace variables
echo "Fixing variables"
perl -pi -w -e 's{glyphicons}{font-awesome/font-awesome}g' ./less/bootstrap.less
# perl -pi -w -e 's/\@fa-font-path:(\ +)"..\/fonts"/\@fa-font-path:$1"\/fonts\/font-awesome"/g;' ./less/font-awesome/variables.less
perl -pi -w -e 's/\@fa-css-prefix:(\ +)fa/\@fa-css-prefix:$1icon/g;' ./less/font-awesome/variables.less

# compile the css
echo "Compiling less"
lessc --strict-math=on ./less/bootstrap.less ./bootstrap.css

# clean up
rm -rf less
echo ""