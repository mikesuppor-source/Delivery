import js from '@eslint/js'
import tseslint from 'typescript-eslint'
export default tseslint.config(
 { ignores:['.next/**','node_modules/**'] },
 js.configs.recommended,
 ...tseslint.configs.recommended,
 { files:['**/*.ts','**/*.tsx'], rules:{
   '@typescript-eslint/no-explicit-any':'off',
   '@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],
   'prefer-const':'warn','no-unused-vars':'off','no-undef':'off'
 }}
)
