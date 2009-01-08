#include <v8.h>

#include <string>
#include <iostream>

#include <cstring>
#include <cstdio>
#include <cstdlib>

using namespace std;
using namespace v8;

class CouchViewServer {
  public:
    static CouchViewServer *Instance(char* _file_name);
    
    int Run();
    char* file_name;

    static Handle<Value> JSprint(const Arguments& args);
    static Handle<Value> JSemit(const Arguments& args);
    static Handle<Value> JSsum(const Arguments& args);
    static Handle<Value> JStoJSON(const Arguments& args);
    static Handle<Value> JSevalcx(const Arguments& args);
    static Handle<Value> JSquit(const Arguments& args);

    static void ReportException(TryCatch *try_catch);
    static void ReportError(string error);

  protected:
    CouchViewServer(char* _file_name);
    CouchViewServer(const CouchViewServer&);
    CouchViewServer& operator= (const CouchViewServer&);

  private:
    Handle<String> source;
    Persistent<Context> context_;
    Persistent<Function> input_cb_;

    bool ReadFile();
    bool PersistInputCallbackFn();
    bool ExecuteScript();
    void RunShell();
};

CouchViewServer* CouchViewServer::Instance(char* _file_name) {
  static CouchViewServer inst(_file_name);
  return &inst;
}

CouchViewServer::CouchViewServer(char* _file_name) {
  HandleScope handle_scope;
  file_name = _file_name;

  // Create global scope
  Handle<ObjectTemplate> global = ObjectTemplate::New();

  // Bind extra functions to global scope
  global->Set(String::New("print"),     FunctionTemplate::New(JSprint));
  //global->Set(String::New("toJSON"),    FunctionTemplate::New(JStoJSON));
  global->Set(String::New("emit"),      FunctionTemplate::New(JSemit));
  global->Set(String::New("sum"),       FunctionTemplate::New(JSsum));
  global->Set(String::New("evalcx"),    FunctionTemplate::New(JSevalcx));
  global->Set(String::New("quit"),      FunctionTemplate::New(JSquit));

  // Create new context with built-in functions
  Handle<Context> context = Context::New(NULL, global);
  context_ = Persistent<Context>::New(context);

  // Activate newly created context
  Context::Scope context_scope(context);
  
  Run();
}

bool CouchViewServer::ReadFile() {
  FILE *file = fopen(file_name, "rb");
  if(file == NULL) return false;

  fseek(file, 0, SEEK_END);
  int size = ftell(file);
  rewind(file);

  char* chars = new char[size + 1];
  chars[size] = '\0';
  for(int i = 0; i < size;) {
    int read = fread(&chars[i], 1, size - i, file);
    i += read;
  }
  fclose(file);

  source = String::New(chars, size);
  delete[] chars;
  return true;
}

bool CouchViewServer::ExecuteScript() {
  HandleScope handle_scope;
  TryCatch try_catch;
  Handle<Script> compiled_script = Script::Compile(source);
  
  if(compiled_script.IsEmpty()) {
    CouchViewServer::ReportException(&try_catch);
    return false;
  }

  try_catch.Reset();
  Handle<Value> result = compiled_script->Run();
  if(result.IsEmpty()) {
    CouchViewServer::ReportException(&try_catch);
    return false;
  }

  if(!result->IsUndefined()) {
    String::Utf8Value str(result);
    fprintf(stdout, "%s\n", *str);
    fflush(stdout);
  }
  
  return true;
}

bool CouchViewServer::PersistInputCallbackFn() {
  HandleScope handle_scope;

  Handle<Context> ctx = Context::GetCurrent();
  Handle<Value> cb = ctx->Global()->Get(String::New("onInput"));

  if(!cb->IsFunction()) {
    ReportError("There is no 'onInput' function");
    return false;
  }
  
  Handle<Function> cb_fn = Handle<Function>::Cast(cb);
  input_cb_ = Persistent<Function>::New(cb_fn);
  
  return true;
}

int CouchViewServer::Run() {
  HandleScope handle_scope;
  
  if(ReadFile()) {
    if(!ExecuteScript()) return 1;
    if(!PersistInputCallbackFn()) return 1;
    
    RunShell();
  } else {
    ReportError("Error while reading file");
    return 1;
  }
  return 0;
}

void CouchViewServer::RunShell() {
  static string line;
  while(cin) {
    getline(cin, line);

    if(line.size() == 0) exit(0);
    
    HandleScope handle_scope;
    const int argc = 1;
    Handle<String> input = String::New(line.c_str());
    Handle<Value> argv[argc] = { input };
    input_cb_->Call(context_->Global(), argc, argv);
  }
}

Handle<Value> CouchViewServer::JSprint(const Arguments& args) {
  bool first = true;
  for(int i = 0; i < args.Length(); i++) {
    HandleScope handle_scope;
    if(first)
        first = false;
    else
      fputc(' ', stdout);

    String::Utf8Value str(args[i]);
    fprintf(stdout, "%s", *str);
  }
  
  fputc('\n', stdout);
  fflush(stdout);
  return Undefined();
}

// TODO: Finish it, it would probably speed up the whole thing
Handle<Value> CouchViewServer::JStoJSON(const Arguments& args) {
  return Undefined();
  /*HandleScope handle_scope;
  
  if(args[0]->IsUndefined()) {
    ReportError("Cannot encode 'undefined' value as JSON");
    return String::New("");
  }
  
  Local<Object> obj = Local<Object>::Cast(args[0]);
  string json;
  
  return String::New(json->c_str());*/
}

Handle<Value> CouchViewServer::JSemit(const Arguments& args) {
  HandleScope handle_scope;
  
  Local<Value> results_ = Context::GetCurrent()->Global()->Get(String::New("map_results"));
  Local<Array> results = Local<Array>::Cast(results_);
  
  Local<Array> res = Array::New(2);
  res->Set(Number::New(0), args[0]);
  res->Set(Number::New(1), args[1]);

  results->Set(Number::New(results->Length()), res);
  
  return Undefined();
}

Handle<Value> CouchViewServer::JSsum(const Arguments& args) {
  HandleScope handle_scope;
  
  int rv = 0;
  Local<Object> values = Local<Object>::Cast(args[0]);
  Local<Array> values_names = values->GetPropertyNames();
  int len = values_names->Length();
  
  for(int n = 0; n < len; n++) {
    Local<Number> i = Number::New(n);
    rv += values->Get(values_names->Get(i))->Int32Value();
  }
  
  return Number::New(rv);
}

// TODO: Finish it
Handle<Value> CouchViewServer::JSevalcx(const Arguments& args) {
  return Undefined();
  /*HandleScope handle_scope;
  TryCatch try_catch;
  
  Handle<Value> fn_code = args[0];
  Handle<Function> fn = Handle<Function>::Cast(fn_code);
  Handle<Object> obj = Handle<Object>::Cast(args[1]);
  Handle<ObjectTemplate> global_obj = ObjectTemplate::New(obj);
  Handle<Context> tmp_ctx = Context::New(0, global_obj);
 
  Context::Scope context_scope(tmp_ctx);
  Handle<Script> compiled_fn = Script::Compile(fn);
  
  if(compiled_fn.IsEmpty()) {
    return try_catch.Exception();
  }
  
  return compiled_fn;*/
  
}

Handle<Value> CouchViewServer::JSquit(const Arguments& args) {
  HandleScope handle_scope;
  int error_code = args[0]->Int32Value();
  exit(error_code);
  return Undefined();
}

void CouchViewServer::ReportError(string error) {
  fprintf(stdout, "{\"error\": \"%s\"}\n", error.c_str());
  fflush(stdout);
}

void CouchViewServer::ReportException(TryCatch* try_catch) {
  HandleScope handle_scope;
  String::Utf8Value exception(try_catch->Exception());
  fprintf(stdout, "{\"error\": \"%s\"}", *exception);
  fflush(stdout);
}

int main(int argc, char* argv[]) {
  HandleScope handle_scope;

  // expose gc() function to JS code (ie. Garbage collector)
  static const char v8Flags [ ] = "--expose-gc";
  V8::SetFlagsFromString (v8Flags, sizeof (v8Flags) - 1);
  
  for(int i = 1; i < argc; i++) {
    const char* str = argv[i];
    if(strcmp(str, "-h") == 0) {
      printf("USAGE: couch_v8 [OPTION] [FILE]\n");
      printf("Javascript view server for Apache CouchDB powered by V8 VM.\n\n");
      printf("Avaiable options:\n");
      printf("  -h  displays this message\n");
      printf("  -v  displays version information\n");
      return 0;
    } else if(strcmp(str, "-v") == 0) {
      printf("Using V8 version %s\n", V8::GetVersion());
      return 0;
    } else {
      CouchViewServer::Instance((char*)str);
      break;
    }
  }
}