import React, { Component } from "react";
import _ from 'lodash';

import './LiveCodeEditor.scss';


import MonacoEditor from 'react-monaco-editor';
// import brace from 'brace';
// import AceEditor from 'react-ace';

// import 'brace/mode/javascript';
// import 'brace/theme/monokai';

class LiveCodeEditor extends Component {

	constructor (props) {
		super(props);
		this.compilers = new Map();
		this.compilers = new Map();
		this.compilers.set('js', {
			transpile: (src) => {
				return src;
			},
			run: (src) => {
				return eval(src);
			}
		});
		this.state = {
			retVal: null,
			src: window.localStorage.getItem('src')
		};
		this.props = {
			lang: 'js'
		};

		this.onChange();
	}

	onChange(ace, value, state) {
		// window.localStorage.setItem('src', value);
		// this.setState({
		// 	lang: this.props.lang,
		// 	src: value,
		// 	compiled: false
		// });
	}

	componentDidUpdate() {
		if (!this.state.compiled) {
			debugger;
			const compiler = this.compilers.get(this.props.lang);
			try {
				const retVal = compiler.run(compiler.transpile(this.state.src));
				this.setState({
					retVal,
					compiled: true
				});
			} catch (e) {
				this.setState({
					retVal: this.stringifyRetVal(e),
					compiled: true
				});
			}
		}
	}

	stringifyRetVal (v) {
		var retVal = (() => {
			switch (typeof v) {
				case 'undefined':
					return 'undefined';
					break;
				case 'function':
					return v.toString();
					break;
				case 'symbol':
					return '[symbol]';
				case 'number':
					if (Number.isNaN(v)) {
						return 'NaN';
					} else {
						return v.toString();
					}
				case 'object':
					if (v === null) {
						return 'null';
					} else if (v instanceof Error) {
						const stack = v.stack.replace(/[\w]*at Object\.run(.|[\r\n])*/mg, '');
						return `${stack}`;
					} else if (v instanceof Map || v instanceof Set || v instanceof WeakMap) {
						v = Array.from(v).reduce((obj, [key, value]) => (
							Object.assign(obj, { [key]: value })
						), {});
					} else if (v instanceof RegExp) {
						return v.toString();
					} else if (v instanceof HTMLElement) {
						return v.toString();
					} else if (Array.isArray(v)) {
						v = v.map(x => typeof x === 'object' ? this.stringifyRetVal(x) : x);
					} else {
						Object.keys(v).forEach(k => {
							v[k] = stringifyRetVal(v[k]);
						});
					}
				default:
					try {
						return JSON.stringify(v);
					} catch (e) {
						return '[unserilizable object]';
					}
			}
		})();
		debugger;
		return retVal.replace(/\n/, '<br>').replace(/^"/mg, '').replace(/"$/mg, '');
	}

	editorDidMount(editor, monaco) {
		console.log('editorDidMount', editor);
		editor.focus();
	}

	render() {
		const me = this;
		const options = {
			selectOnLineNumbers: true
		};
		// const ace = (<AceEditor
		// 	mode="typescript"
		// 	theme="monokai"
		// 	onChange={_.debounce(function (...args) {
		// 		return me.onChange(...[this,...args]);
		// 	}, 250)}
		// 	name="UNIQUE_ID_OF_DIV"
		// 	editorProps={{$blockScrolling: true}}
		// 	value={this.state.src}
		// />);
		// this.ace = ace;
		return (
		<div className="live-code-editor">
			<MonacoEditor
				width="800"
				height="600"
				language="javascript"
				theme="vs-dark"
				value={this.state.src}
				options={options}
				onChange={::this.onChange}
				editorDidMount={::this.editorDidMount}
			/>
			<div className="live-code-editor-result"><pre><code dangerouslySetInnerHTML={{__html: '>> ' + this.stringifyRetVal(this.state.retVal)}}></code></pre></div>
		</div>);
	}
}

export default LiveCodeEditor;