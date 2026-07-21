// GBNF Grammar matching the JSON schema for graph extraction
const GBNF = `
root ::= object
object ::= "{" space "entities" space ":" space list-entities "," space "relationships" space ":" space list-relationships space "}"
list-entities ::= "[" space entities-elements space "]"
entities-elements ::= entity ( "," space entity )* | ""
entity ::= "{" space "id" space ":" space string "," space "type" space ":" space string-type "," space "name" space ":" space string "," space "properties" space ":" space properties-obj space "}"
string-type ::= "\\"Note\\"" | "\\"Person\\"" | "\\"Project\\"" | "\\"Technology\\"" | "\\"Company\\"" | "\\"Concept\\"" | "\\"Task\\"" | "\\"Tag\\""

list-relationships ::= "[" space relationships-elements space "]"
relationships-elements ::= relationship ( "," space relationship )* | ""
relationship ::= "{" space "source_id" space ":" space string "," space "target_id" space ":" space string "," space "type" space ":" space string-rel-type "," space "weight" space ":" space number "," space "metadata" space ":" space properties-obj space "}"
string-rel-type ::= "\\"REFERENCES\\"" | "\\"USES\\"" | "\\"DEPENDS_ON\\"" | "\\"MENTIONS\\"" | "\\"RELATED_TO\\"" | "\\"links_to\\""

properties-obj ::= "{" space "}"
string ::= "\\"" [^"\\r\\n]* "\\""
number ::= [0-9]+ ( "." [0-9]+ )?
space ::= [ \\t\\n\\r]*
`;

module.exports = { GBNF };
