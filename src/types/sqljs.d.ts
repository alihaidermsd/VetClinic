declare module 'sql.js' {
  interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string): any[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    lastInsertRowId(): number;
  }

  interface Statement {
    bind(values?: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(): any;
    free(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
  
  export = initSqlJs;
}
