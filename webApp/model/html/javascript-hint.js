// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (
    typeof exports == "object" && typeof module == "object" // CommonJS
  )
    mod(require("../../lib/codemirror"));
  else if (
    typeof define == "function" && define.amd // AMD
  )
    define(["../../lib/codemirror"], mod); // Plain browser env
  else mod(CodeMirror);
})(function(CodeMirror) {
  var Pos = CodeMirror.Pos;

  function forEach(arr, f) {
    for (var i = 0, e = arr.length; i < e; ++i) f(arr[i]);
  }

  function arrayContains(arr, item) {
    if (!Array.prototype.indexOf) {
      var i = arr.length;
      while (i--) {
        if (arr[i] === item) {
          return true;
        }
      }
      return false;
    }
    return arr.indexOf(item) != -1;
  }

  function scriptHint(editor, getToken, options) {
    // Find the token at the cursor
    var cur = editor.getCursor(), token = getToken(editor, cur);
    if (/\b(?:string|comment)\b/.test(token.type)) return;
    token.state = CodeMirror.innerMode(editor.getMode(), token.state).state;
    // If it's not a 'word-style' token, ignore the token.
    if (!/^[\w$_]*$/.test(token.string)) {
      token = {
        start: cur.ch,
        end: cur.ch,
        string: "",
        state: token.state,
        type: token.string == "." ? "property" : null
      };
    } else if (token.end > cur.ch) {
      token.end = cur.ch;
      token.string = token.string.slice(0, cur.ch - token.start);
    }

    var tprop = token;
    // If it is a property, find out what it is a property of.
    while (tprop.type == "property" || tprop.type === null) {
      tprop = getToken(editor, Pos(cur.line, tprop.start));
      if (tprop.string != ".") return;
      tprop = getToken(editor, Pos(cur.line, tprop.start));
      // 取全文同名变量最后一次赋值的位置
      if (tprop.type === "variable") {
        let value = editor.getValue();
        let reg =
          "(?:\\\s+|^)" +
          tprop.string +
          "(?:\\\s)*=(?:\\\s)*([^(?:\\r\\n,;)]*)";
        let arr = value.match(new RegExp(reg, "g"));
        if (arr && arr.length > 0) {
          try {
            let v = eval(arr[arr.length - 1].split("=")[1]);
            let type = Object.prototype.toString.call(v);
            tprop.string = type.match(/\s+([^\]]*)/)[1];
          } catch (e) {
            console.log(e);
          }
        }
      }
      if (!context) var context = [];
      context.push(tprop);
    }
    return {
      list: getCompletions(token, context, options),
      from: Pos(cur.line, token.start),
      to: Pos(cur.line, token.end)
    };
  }

  function javascriptHint(editor, options) {
    this.type = editor.options.type;
    return scriptHint(
      editor,
      function(e, cur) {
        return e.getTokenAt(cur);
      },
      options
    );
  }
  CodeMirror.registerHelper("hint", "javascript", javascriptHint);

  function getCoffeeScriptToken(editor, cur) {
    var token = editor.getTokenAt(cur);
    if (cur.ch == token.start + 1 && token.string.charAt(0) == ".") {
      token.end = token.start;
      token.string = ".";
      token.type = "property";
    } else if (/^\.[\w$_]*$/.test(token.string)) {
      token.type = "property";
      token.start++;
      token.string = token.string.replace(/\./, "");
    }
    return token;
  }

  function coffeescriptHint(editor, options) {
    return scriptHint(editor, getCoffeeScriptToken, options);
  }
  CodeMirror.registerHelper("hint", "coffeescript", coffeescriptHint);

  function forAllProps(obj, callback) {
    let regularArr =
      ("init data computed directive extend Regular implement  filter animation component use $compile destory" +
      "config parse $inject $watch $unwatch $update $get $refs $on $off $emit $mute $bind $root $outer").split(
        " "
      );
    let vueArr =
      ("init vue computed directive extend nextTick  filter set delete component use mixin compile version data props propsData methods watch render renderError " +
      "beforeCreate created beforeMount mounted beforeUpdate updated activated deactivated beforeDestroy destroyed  delimiters model inheritAttrs comments" +
      "$data $props $el $options $parent $root $children $slots $slots $refs $isServer $attrs $listeners $watch $set $delete $on $once $off $emit $mount $forceUpdate $nextTick $destroy").split(
        " "
      );
    let reactArr =
      ("React ReactDOM " +
      "").split(
        " "
      );
    switch (this.type) {
      case "regular":
        regularArr.forEach(callback);
        break;
      case "vue":
        vueArr.forEach(callback);
        break;
      case "react":
        reactArr.forEach(callback);
        break;
      default:
        break;
    }
    if (!Object.getOwnPropertyNames || !Object.getPrototypeOf) {
      for (var name in obj)
        callback(name);
    } else {
      // 需要将原型中不可枚举的数据也给列出来
      if (obj == window.document || obj == window.Document) {
        obj = window.document;
        for (var o = obj; o; o = o.prototype) {
          Object.getOwnPropertyNames(o).forEach(callback);
        }
        obj = window.Document;
        for (var o = obj; o; o = o.prototype) {
          Object.getOwnPropertyNames(o).forEach(callback);
        }
      } else {
        for (var o = obj; o; o = o.prototype) {
          Object.getOwnPropertyNames(o).forEach(callback);
        }
      }
    }
  }

  function getCompletions(token, context, options) {
    var found = [],
      start = token.string,
      global = (options && options.globalScope) || window;
    function maybeAdd(str) {
      if (str.lastIndexOf(start, 0) == 0 && !arrayContains(found, str))
        found.push(str);
    }
    function gatherCompletions(obj) {
      forAllProps(obj, maybeAdd);
    }
    if (context && context.length) {
      var obj = context.pop(), base;
      if (obj.type && obj.type.indexOf("variable") === 0) {
        if (options && options.additionalContext)
          base = options.additionalContext[obj.string];
        if (!options || options.useGlobalScope !== false)
          base = base || global[obj.string];
      } else if (obj.type.toLowerCase() == "string") {
        base = String;
      } else if (obj.type == "atom") {
        base = 1;
      } else if (obj.type.toLowerCase() == "function") {
        if (
          global.jQuery != null &&
          (obj.string == "$" || obj.string == "jQuery") &&
          typeof global.jQuery == "function"
        )
          base = global.jQuery();
        else if (
          global._ != null && obj.string == "_" && typeof global._ == "function"
        )
          base = global._();
      }
      while (base != null && context.length)
        base = base[context.pop().string];
      if (base != null) gatherCompletions(base);
    } else {
      for (var v = token.state.localVars; v; v = v.next)
        maybeAdd(v.name);
      for (var v = token.state.globalVars; v; v = v.next)
        maybeAdd(v.name);
      if (!options || options.useGlobalScope !== false) {
        gatherCompletions(global);
      }

      var keywords = ("break case catch continue debugger default delete do else false finally for function " +
        "if in instanceof new null return switch throw true try typeof var let const  void while with").split(
        " "
      );
      forEach(keywords, maybeAdd);
    }
    return found;
  }
});
