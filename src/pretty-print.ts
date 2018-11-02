import {
  QualifiedName,
  Value,
  IntValue,
  StringValue,
  FloatValue,
  InstantValue,
  BooleanValue,
  RecordValue,
  ConstructorValue,
  ListValue,
  PseudoValue,
} from '@deondigital/api-client';

const renderQualifiedName = (qn: QualifiedName): string => qn.qualifier.concat(qn.name).join('::');

const renderInt = (v: IntValue): string => v.i.toString();

const renderString = (v: StringValue): string => `"${v.s}"`;

const renderFloat = (v: FloatValue): string =>
  `${v.d.toString()}${Number.isInteger(v.d) ? '.0' : ''}`;

const renderDateTime = (v: InstantValue): string => `#${v.instant}#`;

const renderBoolean = (v: BooleanValue): string => v.b ? 'True' : 'False';

const renderRecord = (v: RecordValue): string => {
  const renderedFields: string[] = Object.keys(v.fields).map(key =>
    v.fields ? `${key} = ${renderValue(v.fields[key])}` : '',
  );
  return `${renderQualifiedName(v.recordTag)} { ${renderedFields.join(', ')} }`;
};

const renderConstructor = (v: ConstructorValue): string => {
  const renderValuePar = (w: Value) => {
    if (w.class === 'ConstructorValue' && w.args && w.args.length > 0) {
      return `(${renderValue(w)})`;
    }
    return renderValue(w);
  };

  const renderedArgs = v.args.map(renderValuePar);
  return [renderQualifiedName(v.name)].concat(renderedArgs).join(' ');
};

const renderList = (v: ListValue): string =>
  `[
${v.elements.map(renderValue).join(',\n  ')}
]`;

const renderPseudoSyntax = (v: PseudoValue<any>): string =>
  renderQualifiedName(v.boundName);

function renderValue(value: Value): string {
  switch (value.class) {
    case 'IntValue':     return renderInt(value);
    case 'StringValue':  return renderString(value);
    case 'FloatValue':   return renderFloat(value);
    case 'InstantValue': return renderDateTime(value);
    case 'BooleanValue': return renderBoolean(value);
    case 'RecordValue' : return renderRecord(value);
    case 'ListValue'   : return renderList(value);
    case 'ConstructorValue' : return renderConstructor(value);
    case 'PseudoValue' : return renderPseudoSyntax(value);
    default: return '';
  }
}

export { renderValue, renderQualifiedName };
