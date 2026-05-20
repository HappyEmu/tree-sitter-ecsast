/**
 * Tree-sitter grammar for ECSAST.
 *
 * Mirrors the hand-written lexer/parser in ../../../src/{lexer,parser}.rs.
 * Operator precedence numbers follow the `infix_bp` table in parser.rs
 * (relative ordering is what matters to tree-sitter).
 */

const PREC = {
  or: 1,
  and: 2,
  bit_or: 3,
  bit_xor: 4,
  bit_and: 5,
  equality: 6,
  comparison: 7,
  shift: 8,
  additive: 9,
  multiplicative: 10,
  power: 11,
  unary: 12,
  call: 13,
};

module.exports = grammar({
  name: 'ecsast',

  extras: $ => [/\s/, $.line_comment],

  word: $ => $.identifier,

  rules: {
    source_file: $ => repeat($._item),

    _item: $ => choice(
      $.use_declaration,
      $.function_declaration,
    ),

    // `use a::b::c;` — an optional trailing `*` is accepted by the grammar so
    // the semantic pass can emit a precise "glob imports not supported" error
    // rather than a parse error.
    use_declaration: $ => seq(
      'use',
      field('path', $.use_path),
      ';',
    ),

    use_path: $ => seq(
      $.identifier,
      repeat(seq('::', choice($.identifier, '*'))),
    ),

    function_declaration: $ => seq(
      optional('pub'),
      optional('inline'),
      'fn',
      field('name', $.identifier),
      field('parameters', $.parameter_list),
      optional(seq('->', field('return_type', $.type))),
      field('body', $.block),
    ),

    parameter_list: $ => seq(
      '(',
      optional(seq(
        $.parameter,
        repeat(seq(',', $.parameter)),
        optional(','),
      )),
      ')',
    ),

    parameter: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $.type),
    ),

    type: $ => choice(
      $.primitive_type,
      $.identifier,
    ),

    primitive_type: $ => choice('int', 'float', 'bool', 'str'),

    block: $ => seq('{', repeat($._statement), '}'),

    _statement: $ => choice(
      $.let_statement,
      $.return_statement,
      $.if_statement,
      $.while_statement,
      $.assignment_statement,
      $.expression_statement,
    ),

    let_statement: $ => seq(
      'let',
      field('name', $.identifier),
      ':',
      field('type', $.type),
      optional(seq('=', field('value', $._expression))),
      ';',
    ),

    return_statement: $ => seq('return', optional($._expression), ';'),

    if_statement: $ => seq(
      'if',
      field('condition', $._expression),
      field('consequence', $.block),
      optional(seq(
        'else',
        field('alternative', choice($.block, $.if_statement)),
      )),
    ),

    while_statement: $ => seq(
      'while',
      field('condition', $._expression),
      field('body', $.block),
    ),

    assignment_statement: $ => prec(-1, seq(
      field('target', $.identifier),
      '=',
      field('value', $._expression),
      ';',
    )),

    expression_statement: $ => seq($._expression, ';'),

    _expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.call_expression,
      $.parenthesized_expression,
      $.float_literal,
      $.integer_literal,
      $.boolean_literal,
      $.string_literal,
      $.path,
      $.identifier,
    ),

    // `module::item` or `module::sub::item`. A bare identifier is parsed as
    // `identifier`, not `path`, so that local variables stay plain idents.
    path: $ => prec.left(seq(
      $.identifier,
      repeat1(seq('::', $.identifier)),
    )),

    binary_expression: $ => {
      const table = [
        [PREC.or, '||', 'left'],
        [PREC.and, '&&', 'left'],
        [PREC.bit_or, '|', 'left'],
        [PREC.bit_xor, '^', 'left'],
        [PREC.bit_and, '&', 'left'],
        [PREC.equality, choice('==', '!='), 'left'],
        [PREC.comparison, choice('<', '<=', '>', '>='), 'left'],
        [PREC.shift, choice('<<', '>>'), 'left'],
        [PREC.additive, choice('+', '-'), 'left'],
        [PREC.multiplicative, choice('*', '/', '%'), 'left'],
        [PREC.power, '**', 'right'],
      ];
      return choice(...table.map(([p, op, assoc]) => {
        const fn = assoc === 'right' ? prec.right : prec.left;
        return fn(p, seq(
          field('left', $._expression),
          field('operator', op),
          field('right', $._expression),
        ));
      }));
    },

    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('-', '!', '~')),
      field('operand', $._expression),
    )),

    call_expression: $ => prec(PREC.call, seq(
      field('function', choice($.path, $.identifier)),
      field('arguments', $.argument_list),
    )),

    argument_list: $ => seq(
      '(',
      optional(seq(
        $._expression,
        repeat(seq(',', $._expression)),
        optional(','),
      )),
      ')',
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    integer_literal: $ => /[0-9]+/,
    float_literal: $ => /[0-9]+\.[0-9]+/,
    boolean_literal: $ => choice('true', 'false'),

    string_literal: $ => seq(
      '"',
      repeat(choice($.escape_sequence, /[^"\\]+/)),
      '"',
    ),

    escape_sequence: $ => token.immediate(/\\[nt"\\]/),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    line_comment: $ => token(seq('//', /.*/)),
  },
});
