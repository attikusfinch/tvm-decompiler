package io.swee.tvm.decompiler.internal.instructions

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.annotation.JsonNaming
import com.fasterxml.jackson.module.kotlin.KotlinModule
import kotlinx.serialization.SerialName
import org.reflections.Reflections
import org.reflections.scanners.Scanners
import org.ton.bytecode.TvmInst

class Cp0InstructionRegistry private constructor(
    val instructions: Map<String, InstructionData>,
    val instructionClassToOpcode: Map<Class<out TvmInst>, String>
) {
    data class InstructionData(
        val instDescriptionRaw: TvmCp0Inst,
        val instClass: Class<out TvmInst>,
        val implicitOperands: Map<String, Any> = emptyMap()
    ) {
        fun isPure(): Boolean {
            // No register write/branch does not make a runtime type/overflow
            // check removable. Retain these arithmetic calls even with dead
            // outputs (e.g. MIN(int, null) must still throw).
            if (instDescriptionRaw.mnemonic in setOf("MIN", "MAX", "MINMAX", "ABS")) return false
            val vf = instDescriptionRaw.valueFlow
            return vf.inputs.registers.isNullOrEmpty() &&
                vf.outputs.registers.isNullOrEmpty() &&
                instDescriptionRaw.controlFlow.nobranch
        }
    }

    fun getByOpcode(asmOpcodeName: String): InstructionData? {
        return instructions[asmOpcodeName]
    }

    fun getByClass(instructionClass: Class<out TvmInst>): InstructionData? {
        return getByOpcode(instructionClassToOpcode[instructionClass] ?: return null)
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstValueFlowInputsStackEntry(
        val type: String,
        val name: String?,
        val lengthVar: String?,
        val valueTypes: List<TvmCp0InstStackEntryType>?
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstValueFlowInputs(
        val stack: List<TvmCp0InstValueFlowInputsStackEntry>?,
        val registers: List<Any>?
    )

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes(
        JsonSubTypes.Type(value = TvmCp0InstValueFlowOutputsEntry.Simple::class, name = "simple"),
        JsonSubTypes.Type(value = TvmCp0InstValueFlowOutputsEntry.Conditional::class, name = "conditional"),
        JsonSubTypes.Type(value = TvmCp0InstValueFlowOutputsEntry.Const::class, name = "const"),
        JsonSubTypes.Type(value = TvmCp0InstValueFlowOutputsEntry.Array::class, name = "array"),
    )
    sealed class TvmCp0InstValueFlowOutputsEntry {
        abstract fun contentEquals(other: TvmCp0InstValueFlowOutputsEntry): Boolean

        @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
        @JsonIgnoreProperties(ignoreUnknown = true)
        data class Simple(
            val name: String?,
            val valueTypes: List<TvmCp0InstStackEntryType>?,
            val tupleElements: List<TvmCp0InstStackEntryType>? = null
        ) : TvmCp0InstValueFlowOutputsEntry() {
            override fun contentEquals(other: TvmCp0InstValueFlowOutputsEntry): Boolean {
                return other is Simple && valueTypes?.filterNot { it.name == "NULL" } == other.valueTypes?.filterNot { it.name == "NULL" }
            }
        }
        @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
        @JsonIgnoreProperties(ignoreUnknown = true)
        data class Const(
            val value: Any?,
            val valueType: TvmCp0InstStackEntryType
        ) : TvmCp0InstValueFlowOutputsEntry() {
            override fun contentEquals(other: TvmCp0InstValueFlowOutputsEntry): Boolean {
                return other is Const && valueType == other.valueType
            }
        }

        @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
        @JsonIgnoreProperties(ignoreUnknown = true)
        data class Conditional(
            val name: String,
            val match: List<Match>
        ) : TvmCp0InstValueFlowOutputsEntry() {
            data class Match(
                val value: Long,
                val stack: List<TvmCp0InstValueFlowOutputsEntry>?
            )

            override fun contentEquals(other: TvmCp0InstValueFlowOutputsEntry): Boolean {
                return other is Conditional && match == other.match
            }
        }
        @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
        @JsonIgnoreProperties(ignoreUnknown = true)
        data class Array(
            val name: String,
            val lengthVar: String,
            val arrayEntry: List<TvmCp0InstValueFlowOutputsEntry>
        ): TvmCp0InstValueFlowOutputsEntry() {
            override fun contentEquals(other: TvmCp0InstValueFlowOutputsEntry): Boolean {
                return other is Array && other.lengthVar == lengthVar && other.arrayEntry == arrayEntry
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstValueFlowOutputs(
        val stack: List<TvmCp0InstValueFlowOutputsEntry>?,
        val registers: List<Any>?
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstValueFlow(
        val inputs: TvmCp0InstValueFlowInputs,
        val outputs: TvmCp0InstValueFlowOutputs,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstControlFlow(
        val branches: List<Any>,
        val nobranch: Boolean
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstDoc(
        val fift: String?,
        val category: String?
    )

    enum class TvmCp0InstBytecodeOperandType {
        @JsonProperty("uint")
        UINT,
        @JsonProperty("int")
        INT,
        @JsonProperty("pushint_long")
        PUSHINT_LONG,
        @JsonProperty("ref")
        REF,
        @JsonProperty("subslice")
        SUBSLICE,
    }

    enum class TvmCp0InstStackEntryType {
        @JsonProperty("Integer")
        INT,
        @JsonProperty("Tuple")
        TUPLE,
        @JsonProperty("Null")
        NULL,
        @JsonProperty("Cell")
        CELL,
        @JsonProperty("Slice")
        SLICE,
        @JsonProperty("Continuation")
        CONTINUATION,
        @JsonProperty("Builder")
        BUILDER,
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes(
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Add::class, name = "add"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Plduz::class, name = "plduz"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Stack::class, name = "stack"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Pushint4::class, name = "pushint4"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Continuation::class, name = "continuation"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.OptionalNargs::class, name = "optional_nargs"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Register::class, name = "register"),
        JsonSubTypes.Type(value = TvmCp0InstBytecodeOperandDisplayHint.Dictionary::class, name = "dictionary"),
    )
    sealed class TvmCp0InstBytecodeOperandDisplayHint {
        data class Add(
            val value: Long
        ) : TvmCp0InstBytecodeOperandDisplayHint()
        data object Plduz : TvmCp0InstBytecodeOperandDisplayHint()
        data object Stack : TvmCp0InstBytecodeOperandDisplayHint()
        data object Pushint4 : TvmCp0InstBytecodeOperandDisplayHint()
        data object Continuation : TvmCp0InstBytecodeOperandDisplayHint()
        data object OptionalNargs : TvmCp0InstBytecodeOperandDisplayHint()
        data object Register : TvmCp0InstBytecodeOperandDisplayHint()
        data class Dictionary(
            val sizeVar: String
        ) : TvmCp0InstBytecodeOperandDisplayHint()
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstBytecodeOperand(
        val type: TvmCp0InstBytecodeOperandType,
        val name: String,
        val displayHints: List<TvmCp0InstBytecodeOperandDisplayHint>?
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0InstBytecode(
        val operands: List<TvmCp0InstBytecodeOperand>
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0Inst(
        val mnemonic: String,
        val bytecode: TvmCp0InstBytecode,
        val valueFlow: TvmCp0InstValueFlow,
        val controlFlow: TvmCp0InstControlFlow,
        val doc: TvmCp0InstDoc?
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0Alias(
        val mnemonic: String,
        val aliasOf: String,
        val operands: Map<String, Any>?
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
    data class TvmCp0Data(
        val instructions: List<TvmCp0Inst>,
        val aliases: List<TvmCp0Alias>
    )

    companion object {
        fun create(): Cp0InstructionRegistry {
            val jsonInstructions: TvmCp0Data = ObjectMapper().registerModule(KotlinModule.Builder().build()).readValue(
                Cp0InstructionRegistry::class.java.getResourceAsStream("/cp0_fixed.json")
                    .readAllBytes(),
                TvmCp0Data::class.java
            )

            val libInstructions: Map<String, Class<TvmInst>> = Reflections("org.ton.bytecode")
                .get(
                    Scanners.TypesAnnotated.of(TvmInst::class.java)
                        .add<Any>(Scanners.TypesAnnotated.of(SerialName::class.java))
                )
                .map {
                    val klass = Class.forName(it)
                    val annotation = klass.getAnnotation(SerialName::class.java)
                    val opName = annotation.value
                    opName to klass
                }.toMap() as Map<String, Class<TvmInst>>

            val baseInstructionsJson = jsonInstructions.instructions.associateBy { it.mnemonic.uppercase() }
            val resultMap = mutableMapOf<String, InstructionData>()

            fun findClassFor(mnemonic: String, fiftDoc: String?): Class<out TvmInst>? {
                libInstructions[mnemonic]?.let { return it }
                if (fiftDoc != null) {
                    val firstFiftWord = fiftDoc.trim().split("\\s+".toRegex()).firstOrNull()?.uppercase()
                    if (firstFiftWord != null && firstFiftWord != mnemonic) {
                        libInstructions[firstFiftWord]?.let { return it }
                    }
                }
                return null
            }

            for (inst in jsonInstructions.instructions) {
                val mnemonic = inst.mnemonic.uppercase()
                val clazz = findClassFor(mnemonic, inst.doc?.fift)

                if (clazz != null) {
                    val data = InstructionData(inst, clazz, emptyMap())
                    resultMap[mnemonic] = data

                    inst.doc?.fift?.trim()?.split("\\s+".toRegex())?.forEach { token ->
                        val key = token.uppercase()
                        if (key.isNotEmpty() && !resultMap.containsKey(key)) {
                            resultMap[key] = data
                        }
                    }
                }
            }

            for (alias in jsonInstructions.aliases) {
                val aliasMnemonic = alias.mnemonic.uppercase()
                val targetMnemonic = alias.aliasOf.uppercase()

                var targetData = resultMap[targetMnemonic]

                if (targetData == null) {
                    val targetJson = baseInstructionsJson[targetMnemonic]
                    if (targetJson != null) {
                        val targetClass = findClassFor(targetMnemonic, targetJson.doc?.fift)
                        if (targetClass != null) {
                            targetData = InstructionData(targetJson, targetClass, emptyMap())
                            resultMap[targetMnemonic] = targetData
                        }
                    }
                }

                if (targetData != null) {
                    val newImplicitOperands = alias.operands ?: emptyMap()
                    val mergedOperands = targetData.implicitOperands + newImplicitOperands

                    val aliasData = InstructionData(
                        instDescriptionRaw = targetData.instDescriptionRaw,
                        instClass = targetData.instClass,
                        implicitOperands = mergedOperands
                    )
                    resultMap[aliasMnemonic] = aliasData
                }
            }

            val instructionClassToOpcode = resultMap.entries
                .filter { it.value.implicitOperands.isEmpty() }
                .associate { it.value.instClass to it.key }

            return Cp0InstructionRegistry(
                resultMap,
                instructionClassToOpcode
            )
        }
    }
}
