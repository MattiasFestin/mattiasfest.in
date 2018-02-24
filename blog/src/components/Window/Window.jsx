import React, { Component } from "react";
import Draggable from 'react-draggable';
// import Resizable from 're-resizable';
// import { Resizable, ResizableBox } from 'react-resizable';
import FontAwesome from 'react-fontawesome';
import Resizable from 're-resizable';

import './Window.scss';

export class ActionIcon extends Component {

	constructor(props, ctx) {
		super(props, ctx);
		this.state = {borderStyle: 'ridge'};
	}

	onMouseDown() {
		this.state.borderStyle = 'inset';
	}

	onMouseUp() {
		this.state.borderStyle = 'ridge';		
	}
	
	render () {
		var a = {
			fontSize: '10px',
			color: 'black',
			widows: '15px',
			height: '15px',
			padding: '2px',
			top: '-3px',
			position: 'relative',
			// margin: 1px;
			backgroundColor: '#ccc',
			borderWidth: '1px',
			borderStyle: this.state.borderStyle,
			borderColor:  '#ccc'
		};
		return (
			<FontAwesome name={'window-' + this.props.name} onMouseDown={this.onMouseDown.bind(this)} />
		);
	}
}

export class TopBar extends Component {
	render () {
		return (
			<div className={this.props.className}>
				<FontAwesome className="app-icon" name='windows' />
				<div className="actions">
					<ActionIcon name='minimize' />
					<ActionIcon name='maximize' />
					<ActionIcon name='close' />
				</div>
			</div>
		);
	}
}

export class Content extends Component {
	render () {
		return (
			<div className={this.props.className}></div>
		);
	}
}

let windows = [];

export class Window extends Component {
	constructor(props, ctx) {
		super(props, ctx);

		debugger;

		this.state = {
			width: this.props.width || 400,
			height: this.props.height || 300,
			style: {
				position: 'fixed',
				width: this.props.width || 400,
				height: this.props.height || 300,
				backgroundColor: this.props.backgroundColor,
				zIndex: 0
			}
		};

		windows.push(this);
	}

	componentDidUpdate() {
		// this.state.style = this.updateStyle();
	}

	componentWillUnmount() {
		windows.splice(windows.indexOf(this), 1);
	}

	toTop() {
		debugger;
		// windows = windows.splice(windows.indexOf(this)).push(this);
		const z = this.state.style.zIndex;
		windows
			.filter(w => w.state.style.zIndex > z)
			.forEach(w => {
				w.state.style.zIndex--;
				w.setState(w.state);
			});
		this.state.style.zIndex = windows.length;
		this.setState(this.state);
	}

	// updateStyle() {
		// const style = {
		// 	...this.state.style,
		// 	... {
		// 		position: 'fixed',
		// 		width: this.props.width || 400,
		// 		height: this.props.height || 300,
		// 		backgroundColor: this.props.backgroundColor,
		// 		zIndex: this.props.zIndex || 0
		// 	}
		// };

		// return style;
	// }

	onClick(e) {
		this.toTop();
	}

	render () {
		console.log(this.state.style);
		return (
			<Draggable {...this.props} onStart={this.onClick.bind(this)} onClick={this.onClick.bind(this)} handle=".window-topbar">
				<Resizable
					defaultSize={{
						width: this.state.style.width,
						height: this.state.style.height,
					}}
					onClick={this.onClick.bind(this)}
					className="window"  onClick={this.onClick.bind(this)} style={this.state && this.state.style}
				>
					<TopBar className="window-topbar"  onClick={this.onClick.bind(this)}>
					</TopBar>
					<Content className="window-content"  onClick={this.onClick.bind(this)}>
						{this.props.children}
					</Content>
				</Resizable>
			</Draggable>
		);
	}
}