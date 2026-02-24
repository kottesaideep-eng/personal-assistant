import ExpoModulesCore

public class SharedDefaultsModule: Module {
    private let appGroupID = "group.com.saideep.personalassistant"

    public func definition() -> ModuleDefinition {
        Name("SharedDefaults")

        Function("setString") { (key: String, value: String) in
            UserDefaults(suiteName: self.appGroupID)?.set(value, forKey: key)
        }

        Function("getString") { (key: String) -> String? in
            UserDefaults(suiteName: self.appGroupID)?.string(forKey: key)
        }
    }
}
