const fs = require('fs');
const UXCore = require('uxcore');
const config = require('./config.json');

const isComponent = (c) => {
    return c.propTypes || c.displayName || c.defaultProps;
};

const walkThrough = (union, components, parentName) => {
    for (let name in union) {
        if (union.hasOwnProperty(name)) {
            let key = name;
            if (parentName
                && config.skipParentName.indexOf(parentName) === -1
                && name.indexOf(parentName) === -1) {
                key = `${parentName}.${name}`;
            }
            if (config.skip.indexOf(key) > -1) {
                continue;
            }
            if (components[key]) {
                continue;
            }
            if (!/^[A-Z]/.test(name)) {
                continue;
            }

            let component = union[name];
            if (!isComponent(component)) {
                if (component.default && isComponent(component.default)) {
                    component = component.default;
                } else {
                    continue;
                }
            }

            const { hasChildren, porps } = stringifyPropTypes(component.propTypes);

            components[key] = {
                hasChildren,
                alias: normalizeDisplayName(key),
                propTypes: porps,
                defaultProps: component.defaultProps,
            };

            walkThrough(component, components, name);
        }
    }
};

const normalizeDisplayName = (name) => {
    if (name) {
        name = name.replace('.', '');
        return name.replace(/[A-Z]/g, (c, i) => {
            return (i === 0 ? '' : '-') + c.toLowerCase();
        });
    }
    return name;
};

const stringifyPropTypes = (propTypes) => {
    let hasChildren = false;
    const props = {};

    for (let key in propTypes) {
        if (propTypes.hasOwnProperty(key)) {
            if (key === 'children') {
                hasChildren = true;
            } else {
                props[key] = null;
            }
        }
    }

    return {
        hasChildren,
        props,
    };
};

const quoteForXML = (input) => {
    input = input.replace(/&/g, '&amp;');
    input = input.replace(/'/g, '&apos;');
    input = input.replace(/</g, '&lt;');
    input = input.replace(/>/g, '&gt;');
    input = input.replace(/"/g, '&quot;');
    return input;
};

const convertPropsToHTML = (props) => {
    const html = [];
    const params = {};
    const toString = Object.prototype.toString;

    let children;
    for (let key in props) {
        const value = props[key];

        if (key === 'children') {
            children = value;
            continue;
        }

        // id=&quot;$id$&quot; &#10;

        switch (toString.call(value)) {
            case '[object Number]':
                html.push(`${key}={$${key}$}`);
                params[key] = value;
                break;
            case '[object Object]':
                if ('type' in value && 'key' in value && 'ref' in value) {
                    // jsx props
                    continue;
                }
                html.push(`${key}={$${key}$}`);
                params[key] = quoteForXML(JSON.stringify(value));
                break;
            case '[object Boolean]':
                if (value) {
                    html.push(`${key}`);
                } else {
                    html.push(`${key}={$${key}$}`);
                    params[key] = value;
                }
                break;
            case '[object String]':
                html.push(`${key}=&quot;$${key}$&quot;`);
                params[key] = value;
                break;
            default:
                html.push(`${key}={}`);
                break;
        }
    }

    return {
        propsLength: html.length,
        propsHTML: html.join(` &#10;    `),
        children,
        params,
    };
};

const components = {};

walkThrough(UXCore, components);

console.info("Find ", Object.keys(components).length, " components");

const xmlArray = [
    '<templateSet group="UXCore">',
];

for (let key in components) {
    const component = components[key];

    let { propsLength, propsHTML, children, params } = convertPropsToHTML(component.defaultProps);
    if (!children) {
        children = `$END$`;
    }

    let content = '';
    if (component.hasChildren) {
        if (propsLength) {
            if (propsLength > 1) {
                content = `&lt;${key}&#10;    ${propsHTML}&#10;&gt;&#10;    ${children}&#10;&lt;/${key}&gt;&#10;`;
            } else {
                content = `&lt;${key} ${propsHTML}&gt;&#10;    ${children} &#10;&lt;/${key}&gt;&#10;`;
            }
        } else {
            content = `&lt;${key}&gt;&#10;    ${children}&#10;&lt;/${key}&gt;&#10;`;
        }

    } else {
        if (propsLength) {
            if (propsLength > 1) {
                content = `&lt;${key}&#10;    ${propsHTML}&#10;/&gt;&#10;`;
            } else {
                content = `&lt;${key}&#10;    ${propsHTML}&#10;/&gt;&#10;`;
            }
        } else {
            content = `&lt;${key} /&gt;&#10;`;
        }
    }

    xmlArray.push(`
    <template name="${config.prefix}${component.alias}"
              value="${content}"
              description="UXCore ${key}" toReformat="true" toShortenFQNames="true">
`);

    for (let p in params) {
        xmlArray.push(`        <variable name="${p}" expression="" defaultValue="&quot;${params[p]}&quot;" alwaysStopAt="true"/>`);
    }

    xmlArray.push(`        <context>
            <option name="HTML" value="true"/>
            <option name="HTML_TEXT" value="true"/>
            <option name="JAVASCRIPT" value="true"/>
            <option name="JAVASCRIPT_EXPRESSION" value="true"/>
            <option name="JAVASCRIPT_JSX_HTML" value="true"/>
            <option name="JAVASCRIPT_STATEMENT" value="true"/>
            <option name="JAVASCRIPT_OTHER" value="true"/>
            <option name="OTHER" value="true"/>
        </context>
     </template>`);
}

xmlArray.push('</templateSet>');

const fileName = `../resources/liveTemplates/UXCore.xml`;
fs.writeFileSync(fileName, xmlArray.join("\n"));