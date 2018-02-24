/* eslint import/no-unresolved:"off" */
/* eslint import/extensions:"off" */
/* eslint global-require:"off" */
import React from "react";
import favicon from "./favicon.png";

let inlinedStyles = "";
if (process.env.NODE_ENV === "production") {
	try {
		/* eslint import/no-webpack-loader-syntax: off */
		inlinedStyles = require("!raw-loader!../public/styles.css");
	} catch (e) {
		/* eslint no-console: "off"*/
		console.log(e);
	}
}

const BUILD_TIME = new Date().getTime();

export default class HTML extends React.Component {
	render() {
		let css;
		if (process.env.NODE_ENV === "production") {
			css = (
				<style
					id="gatsby-inlined-css"
					dangerouslySetInnerHTML={{ __html: inlinedStyles }}
				/>
			);
		}
		return (
			<html lang="en">
				<head>
					<meta charSet="utf-8" />
					<meta
						name="viewport"
						content="width=device-width, initial-scale=1.0"
					/>
					{this.props.headComponents}
					<link rel="shortcut icon" href={favicon} />
					{/* <href rel="stylesheet" href="https://storage.googleapis.com/app.klipse.tech/css/codemirror.css"/>
					<script src="https://storage.googleapis.com/app.klipse.tech/plugin_prod/js/klipse_plugin.min.js"></script> */}
					<script src="https://rawgit.com/Microsoft/TypeScript/master/lib/typescriptServices.js"></script>
    				<script src="https://rawgit.com/basarat/typescript-script/master/transpiler.js"></script>
					<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.1/MathJax.js?config=TeX-MML-AM_CHTML"></script>
					<script src="//s7.addthis.com/js/300/addthis_widget.js#pubid=ra-5a68a2b9e049f95c"></script> {/* &async=1 */}
					{css}
				</head>
				<body>
					<div
						id="___gatsby"
						dangerouslySetInnerHTML={{ __html: this.props.body }}
					/>
					{this.props.postBodyComponents}
					<script dangerouslySetInnerHTML={{__html: `
					if (typeof window !== 'undefined') {
						if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
							window.addEventListener('load', function() {
								navigator.serviceWorker.register('/service-worker.js?t=${BUILD_TIME}').then(function(registration) {
									// Registration was successful
									console.log('ServiceWorker registration successful with scope: ', registration.scope);
								}, function(err) {
									// registration failed :(
									console.log('ServiceWorker registration failed: ', err);
								});
							});
						}
					}
					`}}></script>
				</body>
			</html>
		);
	}
}
