// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { UUID } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
import React from 'react';
import ReactDOM from 'react-dom';

import { Text } from '@jupyterlab/coreutils';

import { iconStyle, IIconStyle } from '../style';
import { getReactAttrs, classes, classesDedupe } from '../utils';

import badSvgstr from '../../style/debug/bad.svg';
import blankSvgstr from '../../style/debug/blank.svg';
import refreshSvgstr from '../../style/icons/toolbar/refresh.svg';

export class JLIcon implements JLIcon.IJLIcon, JLIcon.IRenderer {
  /***********
   * statics *
   ***********/

  /**
   * Get any existing JLIcon instance by name.
   *
   * @param name - name of the JLIcon instance to fetch
   *
   * @param fallback - optional default JLIcon instance to use if
   * name is not found
   *
   * @returns A JLIcon instance
   */
  private static _get(name: string, fallback?: JLIcon): JLIcon | undefined {
    for (let className of name.split(/\s+/)) {
      if (JLIcon._instances.has(className)) {
        return JLIcon._instances.get(className);
      }
    }

    // lookup failed
    if (JLIcon._debug) {
      // fail noisily
      console.error(`Invalid icon name: ${name}`);
      return badIcon;
    }

    // fail silently
    return fallback;
  }

  /**
   * Get any existing JLIcon instance by name, construct a DOM element
   * from it, then return said element.
   *
   * @param name - name of the JLIcon instance to fetch
   *
   * @param fallback - if left undefined, use automatic fallback to
   * icons-as-css-background behavior: elem will be constructed using
   * a blank icon with `elem.className = classes(name, props.className)`,
   * where elem is the return value. Otherwise, fallback can be used to
   * define the default JLIcon instance, returned whenever lookup fails
   *
   * @param props - passed directly to JLIcon.element
   *
   * @returns an SVGElement
   */
  static getElement({
    name,
    fallback,
    ...props
  }: { name: string; fallback?: JLIcon } & JLIcon.IProps) {
    let icon = JLIcon._get(name, fallback);
    if (!icon) {
      icon = blankIcon;
      props.className = classesDedupe(name, props.className);
    }

    return icon.element(props);
  }

  /**
   * Get any existing JLIcon instance by name, construct a React element
   * from it, then return said element.
   *
   * @param name - name of the JLIcon instance to fetch
   *
   * @param fallback - if left undefined, use automatic fallback to
   * icons-as-css-background behavior: elem will be constructed using
   * a blank icon with `elem.className = classes(name, props.className)`,
   * where elem is the return value. Otherwise, fallback can be used to
   * define the default JLIcon instance, used to construct the return
   * elem whenever lookup fails
   *
   * @param props - passed directly to JLIcon.react
   *
   * @returns a React element
   */
  static getReact({
    name,
    fallback,
    ...props
  }: { name: string; fallback?: JLIcon } & JLIcon.IReactProps) {
    let icon = JLIcon._get(name, fallback);
    if (!icon) {
      icon = blankIcon;
      props.className = classesDedupe(name, props.className);
    }

    return <icon.react {...props} />;
  }

  /**
   * Remove the svg element from a container element
   */
  static remove(container: HTMLElement) {
    // clean up all children
    while (container.firstChild) {
      container.firstChild.remove();
    }

    // remove all classes
    container.className = '';

    return container;
  }

  /**
   * Resolve an icon name or a {name, svgstr} pair into an
   * actual JLIcon.
   *
   * @param icon - either a string with the name of an existing icon
   * or an object with {name: string, svgstr: string} fields.
   *
   * @returns a JLIcon instance, or null if an icon name was passed in
   * and lookup fails.
   */
  static resolve(icon: JLIcon.IResolvable): JLIcon {
    if (icon instanceof JLIcon) {
      // icon already is a JLIcon; nothing to do here
      return icon;
    }

    if (typeof icon === 'string') {
      // do a dynamic lookup of existing icon by name
      const resolved = JLIcon._get(icon);
      if (resolved) {
        return resolved;
      }

      // no matching icon currently registered, create a new loading icon
      // TODO: find better icon (maybe animate?) for loading icon
      return new JLIcon({ name: icon, svgstr: refreshSvgstr, _loading: true });
    }

    // icon was provided as a non-JLIcon {name, svgstr} pair, communicating
    // an intention to create a new icon
    return new JLIcon(icon);
  }

  /**
   * Resolve a {name, svgstr} pair into an actual svg node.
   */
  static resolveSvg({ name, svgstr }: JLIcon.IJLIcon): HTMLElement | null {
    const svgDoc = new DOMParser().parseFromString(svgstr, 'image/svg+xml');

    const svgError = svgDoc.querySelector('parsererror');

    // structure of error element varies by browser, search at top level
    if (svgError) {
      // parse failed, svgElement will be an error box
      const errmsg = `SVG HTML was malformed for JLIcon instance.\nname: ${name}, svgstr: ${svgstr}`;
      if (JLIcon._debug) {
        // fail noisily, render the error box
        console.error(errmsg);
        return svgError as HTMLElement;
      } else {
        // bad svg is always a real error, fail silently but warn
        console.warn(errmsg);
        return null;
      }
    } else {
      // parse succeeded
      return svgDoc.documentElement;
    }
  }

  /**
   * Toggle icon debug from off-to-on, or vice-versa.
   *
   * @param debug - optional boolean to force debug on or off
   */
  static toggleDebug(debug?: boolean) {
    JLIcon._debug = debug ?? !JLIcon._debug;
  }

  private static _debug: boolean = false;
  private static _instances = new Map<string, JLIcon>();

  /***********
   * members *
   ***********/

  constructor({
    name,
    svgstr,
    render,
    unrender,
    rendererClass = JLIcon.ElementRenderer,
    _loading = false
  }: JLIcon.IOptions & { _loading?: boolean }) {
    if (!(name && svgstr)) {
      // sanity check failed
      console.error(
        `When defining a new JLIcon, name and svgstr must both be non-empty strings. name: ${name}, svgstr: ${svgstr}`
      );
      return badIcon;
    }

    // currently this needs to be set early, before checks for existing icons
    this._loading = _loading;

    // check to see if this is a redefinition of an existing icon
    if (JLIcon._instances.has(name)) {
      // fetch the existing icon, replace its svg, then return it
      const icon = JLIcon._instances.get(name)!;
      if (this._loading) {
        // replace the placeholder svg in icon
        icon.svgstr = svgstr;
        this._loading = false;
        return icon;
      } else {
        // already loaded icon svg exists; replace it and warn
        // TODO: need to see if this warning is useful or just noisy
        console.warn(
          `Redefining previously loaded icon svgstr. name: ${name}, svgstrOld: ${icon.svgstr}, svgstr: ${svgstr}`
        );
        icon.svgstr = svgstr;
        return icon;
      }
    }

    this.name = name;
    this._className = Private.nameToClassName(name);
    this.svgstr = svgstr;

    this.react = this._initReact();

    if (render && unrender) {
      this.render = render.bind(this);
      this.unrender = unrender.bind(this);
    } else {
      // set render and unrender methods based on the supplied rendererClass
      const renderer = new rendererClass(this);
      this.render = renderer.render.bind(this);
      this.unrender = renderer.unrender.bind(this);
    }
    JLIcon._instances.set(this.name, this);
    JLIcon._instances.set(this._className, this);
  }

  /**
   * Create an icon as a DOM element
   *
   * @param className - a string that will be used as the class
   * of the container element. Overrides any existing class
   *
   * @param container - a preexisting DOM element that
   * will be used as the container for the svg element
   *
   * @param label - text that will be displayed adjacent
   * to the icon
   *
   * @param title - a tooltip for the icon
   *
   * @param tag - if container is not explicitly
   * provided, this tag will be used when creating the container
   *
   * @param propsStyle - style parameters that get passed to TypeStyle in
   * order to generate a style class. The style class will be added
   * to the icon container's classes, while the style itself will be
   * applied to any svg elements within the container.
   *
   * @returns A DOM element that contains an (inline) svg element
   * that displays an icon
   */
  element({
    className,
    container,
    label,
    title,
    tag = 'div',
    ...propsStyle
  }: JLIcon.IProps = {}): HTMLElement {
    // check if icon element is already set
    const maybeSvgElement = container?.firstChild as HTMLElement;
    if (maybeSvgElement?.dataset?.iconId === this._uuid) {
      // return the existing icon element
      return maybeSvgElement;
    }

    // ensure that svg html is valid
    const svgElement = this._initSvg({ uuid: this._uuid });
    if (!svgElement) {
      // bail if failing silently, return blank element
      return document.createElement('div');
    }

    let ret: HTMLElement;
    if (container) {
      // take ownership by removing any existing children
      while (container.firstChild) {
        container.firstChild.remove();
      }

      ret = svgElement;
    } else {
      // create a container if needed
      container = document.createElement(tag);

      ret = container;
    }
    if (label != null) {
      container.textContent = label;
    }
    this._initContainer({ container, className, propsStyle, title });

    // add the svg node to the container
    container.appendChild(svgElement);

    return ret;
  }

  get svgstr() {
    return this._svgstr;
  }

  set svgstr(svgstr: string) {
    this._svgstr = svgstr;

    // associate a new unique id with this particular svgstr
    const uuid = UUID.uuid4();
    const uuidOld = this._uuid;
    this._uuid = uuid;

    // update icon elements created using .element method
    document
      .querySelectorAll(`[data-icon-id=${uuidOld}]`)
      .forEach(oldSvgElement => {
        const svgElement = this._initSvg({ uuid });
        if (svgElement) {
          oldSvgElement.replaceWith(svgElement);
        }
      });

    // trigger update of icon elements created using other methods
    this._svgReplaced.emit();
  }

  protected _initContainer({
    container,

    className,
    propsStyle,
    title
  }: {
    container: HTMLElement;
    className?: string;
    propsStyle?: IIconStyle;
    title?: string;
  }): string {
    if (title != null) {
      container.title = title;
    }

    const classStyle = iconStyle(propsStyle);
    if (className != null) {
      // override the container class with explicitly passed-in class + style class
      const classResolved = classes(className, classStyle);
      container.className = classResolved;
      return classResolved;
    } else if (classStyle) {
      // add the style class to the container class
      container.classList.add(classStyle);
      return classStyle;
    } else {
      return '';
    }
  }

  protected _initReact() {
    const component = React.forwardRef(
      (
        {
          className,
          container,
          label,
          title,
          tag = 'div',
          ...propsStyle
        }: JLIcon.IProps = {},
        ref: React.RefObject<SVGElement>
      ) => {
        // set up component state via useState hook
        const [, setId] = React.useState(this._uuid);

        // subscribe to svg replacement via useEffect hook
        React.useEffect(() => {
          const onSvgReplaced = () => {
            setId(this._uuid);
          };

          this._svgReplaced.connect(onSvgReplaced);

          // specify cleanup callback as hook return
          return () => {
            this._svgReplaced.disconnect(onSvgReplaced);
          };
        });

        // make it so that tag can be used as a jsx component
        const Tag = tag;

        // ensure that svg html is valid
        const svgElement = this._initSvg();
        if (!svgElement) {
          // bail if failing silently
          return <></>;
        }

        const svgComponent = (
          <svg
            {...getReactAttrs(svgElement)}
            dangerouslySetInnerHTML={{ __html: svgElement.innerHTML }}
            ref={ref}
          />
        );

        if (container) {
          this._initContainer({ container, className, propsStyle, title });

          return (
            <React.Fragment>
              {svgComponent}
              {label}
            </React.Fragment>
          );
        } else {
          return (
            <Tag className={classes(className, iconStyle(propsStyle))}>
              {svgComponent}
              {label}
            </Tag>
          );
        }
      }
    );

    component.displayName = `JLIcon_${this.name}`;
    return component;
  }

  protected _initSvg({
    title,
    uuid
  }: { title?: string; uuid?: string } = {}): HTMLElement | null {
    const svgElement = JLIcon.resolveSvg(this);

    if (!svgElement) {
      // bail on null svg element
      return svgElement;
    }

    if (svgElement.tagName !== 'parsererror') {
      // svgElement is an actual svg node, augment it
      svgElement.dataset.icon = this.name;

      if (uuid) {
        svgElement.dataset.iconId = uuid;
      }

      if (title) {
        Private.setTitleSvg(svgElement, title);
      }
    }

    return svgElement;
  }

  readonly name: string;

  /**
   * A React component that will create the icon.
   *
   * @param className - a string that will be used as the class
   * of the container element. Overrides any existing class
   *
   * @param container - a preexisting DOM element that
   * will be used as the container for the svg element
   *
   * @param label - text that will be displayed adjacent
   * to the icon
   *
   * @param title - a tooltip for the icon
   *
   * @param tag - if container is not explicitly
   * provided, this tag will be used when creating the container
   *
   * @param propsStyle - style parameters that get passed to TypeStyle in
   * order to generate a style class. The style class will be added
   * to the icon container's classes, while the style itself will be
   * applied to any svg elements within the container.
   */
  readonly react: JLIcon.IReact;

  readonly render: (container: HTMLElement, props?: JLIcon.IProps) => void;
  readonly unrender: (container: HTMLElement) => void;

  protected _className: string;
  protected _icon = this;
  protected _loading: boolean;
  protected _svgReplaced = new Signal<this, void>(this);
  protected _svgstr: string;
  protected _uuid: string;
}

/**
 * A namespace for JLIcon statics.
 */
export namespace JLIcon {
  /**************
   * interfaces *
   **************/

  /**
   * The simplest possible interface for defining a generic icon.
   */
  export interface IIcon {
    /**
     * The name of the icon. By convention, the icon name will be namespaced
     * as so:
     *
     *     "pkg-name:icon-name"
     */
    readonly name: string;

    /**
     * A string containing the raw contents of an svg file.
     */
    svgstr: string;
  }

  /**
   * Interface for generic renderer. Compatible with interface of
   * Title.iconRenderer from @lumino/widgets
   */
  export interface IRenderer {
    readonly render: (container: HTMLElement) => void;
    readonly unrender: (container: HTMLElement) => void;
  }

  /**
   * The IJLIcon interface. Outside of this interface the actual
   * implementation of JLIcon may vary
   */
  export interface IJLIcon extends IIcon, IRenderer {}

  /**
   * Interface defining the parameters to be passed to the JLIcon
   * constructor
   */
  export interface IOptions extends IIcon, Partial<IRenderer> {
    rendererClass?: typeof Renderer;
  }

  /**
   * The input props for creating a new JLIcon
   */
  export interface IProps extends IIconStyle {
    /**
     * Extra classNames. Used in addition to the typestyle className to
     * set the className of the icon's outermost container node
     */
    className?: string;

    /**
     * The icon's outermost node, which acts as a container for the actual
     * svg node. If container is not supplied, it will be created
     */
    container?: HTMLElement;

    /**
     * Optional text label that will be added as a sibling to the icon's
     * svg node
     */
    label?: string;

    /**
     * HTML element tag used to create the icon's outermost container node,
     * if no container is passed in
     */
    tag?: 'div' | 'span';

    /**
     * Optional title that will be set on the icon's outermost container node
     */
    title?: string;
  }

  /*********
   * types *
   *********/

  /**
   * A type that can be resolved to a JLIcon instance.
   */
  export type IResolvable = string | (IIcon & Partial<IRenderer>);

  /**
   * The properties that can be passed into the React component stored in
   * the .react field of a JLIcon.
   */
  export type IReactProps = IProps & React.RefAttributes<SVGElement>;

  /**
   * The complete type of the React component stored in the .react
   * field of a JLIcon.
   */
  export type IReact = React.ForwardRefExoticComponent<IReactProps>;

  /***********
   * classes *
   ***********/

  /**
   * Base implementation of IRenderer.
   */
  export class Renderer implements IRenderer {
    constructor(protected _icon: JLIcon, protected _props?: IProps) {}

    // tslint:disable-next-line:no-empty
    render(container: HTMLElement): void {}
    // tslint:disable-next-line:no-empty
    unrender(container: HTMLElement): void {}
  }

  /**
   * Implementation of IRenderer that creates the icon svg node
   * as a DOM element.
   */
  export class ElementRenderer extends Renderer {
    render(container: HTMLElement, props: JLIcon.IProps = {}): void {
      // TODO: move this title fix to the Lumino side
      container.removeAttribute('title');

      this._icon.element({ container, ...this._props, ...props });
    }

    // tslint:disable-next-line:no-empty
    unrender(container: HTMLElement): void {}
  }

  /**
   * Implementation of IRenderer that creates the icon svg node
   * as a React component.
   */
  export class ReactRenderer extends Renderer {
    render(container: HTMLElement, props: JLIcon.IProps = {}): void {
      // TODO: move this title fix to the Lumino side
      container.removeAttribute('title');

      return ReactDOM.render(
        <this._icon.react
          container={container}
          {...{ ...this._props, ...props }}
        />,
        container
      );
    }

    unrender(container: HTMLElement): void {
      ReactDOM.unmountComponentAtNode(container);
    }
  }
}

namespace Private {
  /**
   * @param name - icon name. May be namespaced as per `some-pkg:foo-bar`
   *
   * @returns given a name of `some-pkg:foo-bar`, returns `jp-FooBarIcon`
   */
  export function nameToClassName(name: string): string {
    return 'jp-' + Text.camelCase(name.split(':').pop()!, true) + 'Icon';
  }

  export function setTitleSvg(svgNode: HTMLElement, title: string): void {
    // add a title node to the top level svg node
    let titleNodes = svgNode.getElementsByTagName('title');
    if (titleNodes.length) {
      titleNodes[0].textContent = title;
    } else {
      let titleNode = document.createElement('title');
      titleNode.textContent = title;
      svgNode.appendChild(titleNode);
    }
  }
}

// need to be at the bottom since constructor depends on Private
export const badIcon = new JLIcon({
  name: 'ui-components:bad',
  svgstr: badSvgstr
});
export const blankIcon = new JLIcon({
  name: 'ui-components:blank',
  svgstr: blankSvgstr
});
