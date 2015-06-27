'use strict';

define(['angular'], function(angular) {

    var app = angular.module('bugattiApp.controller.admin.projectModule', ['ngCookies']);

    app.controller('ProjectCtrl', ['$scope', '$state', '$stateParams', '$cookies', '$modal', 'growl', 'ProjectService', 'VersionService', 'EnvService', 'TemplateService',
        function($scope, $state, $stateParams, $cookies, $modal, growl, ProjectService, VersionService, EnvService, TemplateService) {
            $scope.app.breadcrumb='项目管理';
            $scope.currentPage = 1;
            $scope.pageSize = 20;

            // load env
            EnvService.getAll(function(data) {
                if (data == null || data.length == 0) {
                    return;
                }
                $scope.envId = data[0].id;
            });
            TemplateService.all(function(data) {
                $scope.templates = data;
            });

            $scope.tempSelect = function(e) {
                e = e == null ? undefined : e;
                $scope.s_template = e;
            };

            $scope.searchForm = function(projectName, templateId) {
                // 保持搜索状态
                if (angular.isDefined(projectName)) {
                    $cookies.search_project_name = projectName;
                } else {
                    if (angular.isDefined($cookies.search_project_name)) {
                        $scope.s_projectName = $cookies.search_project_name;
                        projectName = $cookies.search_project_name;
                    }
                }

                // count
                ProjectService.count(projectName, templateId, function(data) {
                    $scope.totalItems = data;
                });

                // list
                ProjectService.getPage(projectName, templateId, 0, $scope.pageSize, function(data) {
                    $scope.projects = data;
                });
            };

            $scope.searchForm($scope.s_projectName, $scope.s_template);

            // page
            $scope.setPage = function (pageNo) {
                ProjectService.getPage($scope.s_projectName, $scope.s_template, pageNo - 1, $scope.pageSize, function(data) {
                    $scope.projects = data;
                });
            };

            // remove
            $scope.delete = function(id, index) {
                var modalInstance = $modal.open({
                    templateUrl: 'partials/modal.html',
                    controller: function ($scope, $modalInstance) {
                        $scope.ok = function () {
                            ProjectService.remove(id, function(data) {
                                $modalInstance.close(data);
                            });
                        };
                        $scope.cancel = function () {
                            $modalInstance.dismiss('cancel');
                        };
                    }
                });
                modalInstance.result.then(function(data) {
                    if (data.r == 'exist') {
                        growl.addWarnMessage('还有版本存在该项目，请删除后再操作。。。');
                    } else {
                        $scope.projects.splice(index, 1);
                        ProjectService.count($scope.s_projectName, function(num) {
                            $scope.totalItems = num;
                        });
                    }
                });
            };


    }]);

    app.controller('ProjectShowCtrl', ['$scope', '$stateParams', '$modal', 'growl', 'ProjectService', 'EnvService',
        function($scope, $stateParams, $modal, growl, ProjectService, EnvService) {
            ProjectService.get($stateParams.id, function(data) {
                $scope.project = data;
            });

            ProjectService.atts($stateParams.id, function(data) {
                $scope.atts = data;
            });

            // load env all
            EnvService.getAll(function(data) {
                if (data == null || data.length == 0) {
                    return;
                }
                $scope.envs = data;
                $scope.envChange(data[0]);

            });

            // select env
            $scope.envChange = function(e) {
                $scope.env = e;

                // load init variable
                ProjectService.vars($stateParams.id, $scope.env.id, function(data) {
                    $scope.vars = data;
                });

            };

            // ---------------------------------------------
            // 项目成员管理
            // ---------------------------------------------
            ProjectService.members($stateParams.id, function(data) {
                $scope.members = data;
            });

            $scope.addMember = function(jobNo) {
                $scope.jobNo$error = '';
                if (!/^[A-Za-z0-9]{1,10}$/i.test(jobNo)) {
                    $scope.jobNo$error = '工号格式错误';
                    return;
                }
                var exist = false;
                angular.forEach($scope.members, function(m) {
                    if (m.jobNo === jobNo) {
                        exist = true;
                    }
                });
                if (exist) {
                    $scope.jobNo$error = '已存在';
                    return;
                }

                ProjectService.saveMember($stateParams.id, jobNo, function(data) {
                    if (data.r === 'none') {
                        $scope.jobNo$error = '用户不存在';
                    }
                    else if (data.r === 'exist') {
                        $scope.jobNo$error = '已存在用户';
                    } else if (data > 0) {
                        ProjectService.members($stateParams.id, function(data) {
                            $scope.members = data;
                            $scope.jobNo$error = '';
                        });
                    }
                });
            };

            $scope.memberUp = function(mid, msg) {
                if (confirm(msg)) {
                    ProjectService.updateMember(mid, "up", function(data) {
                        if (data.r == 'exist') {
                            growl.addWarnMessage('出于安全问题，项目管理员最多3人！请根据实际情况调整。');
                        } else {
                            ProjectService.members($stateParams.id, function(data) {
                                $scope.members = data;
                            });
                        }
                    });
                }
            };
            $scope.memberDown = function(mid, msg) {
                if (confirm(msg)) {
                    ProjectService.updateMember(mid, "down", function(data) {
                        ProjectService.members($stateParams.id, function(data) {
                            $scope.members = data;
                        });
                    });
                }
            };
            $scope.memberRemove = function(mid, msg) {
                if (confirm(msg)) {
                    ProjectService.updateMember(mid, "remove", function(data) {
                        ProjectService.members($stateParams.id, function(data) {
                            $scope.members = data;
                        });
                    });
                }
            };
    }]);

    app.controller('ProjectCreateCtrl', ['$scope', '$stateParams', '$state', 'growl', 'ProjectService', 'TemplateService', 'EnvService',
        function($scope, $stateParams, $state, growl, ProjectService, TemplateService, EnvService) {
            $scope.saveOrUpdate = function(project) {
                project.items = [];
                project.variables = angular.copy($scope.vars);
                angular.forEach($scope.items, function(item) {
                    project.items.push({name: item.itemName, value: item.value})
                });

                ProjectService.save(angular.toJson(project), function(data) {
                    if (data.r === 'exist') {
                        $scope.form.name.$invalid = true;
                        $scope.form.name.$error.exists = true;
                    } else {
                        growl.addSuccessMessage("创建成功");
                        if ($state.includes('admin.project')) {
                            $state.go("admin.project");
                        } else {
                            $state.go("profile.project");
                        }
                    }
                });
            };

            // load template all
            TemplateService.all(function(data) {
                $scope.templates = data;
            });

            // template change
            $scope.templateChange = function(tid) {
                $scope.items = [];
                if (angular.isUndefined(tid)) {
                    return;
                }
                if (angular.isUndefined($scope.env)) {
                    return;
                }
                var currScriptVersion = $scope.env.scriptVersion
                TemplateService.itemAttrs(tid, currScriptVersion, function(data) {
                    $scope.items = data;
                    // default init <input> ng-model value
                    angular.forEach($scope.items, function(item) {
                        if (item.default) {
                            item.value = item.default;
                        }
                    })
                });
                TemplateService.itemVars(tid, currScriptVersion, function(data) {
                    var _vars = angular.copy($scope.vars);
                    angular.forEach(_vars, function(v, index) {
                        if (v.name.indexOf('t_') === 0) {
                            delete _vars[index]; // delete object is null
                        }
                    });
                    _vars = _vars.filter(function(e){return e}); // clear null
                    angular.forEach(data, function(d) {
                        _vars.unshift({name: d.itemName, value: '', level: d.level, envId: $scope.env.id});  // first add
                    });
                    $scope.vars = _vars;
                });
            };

            // load env all
            EnvService.getAll(function(data) {
                if (data == null || data.length == 0) {
                    return;
                }
                $scope.envs = data;
                $scope.envChange(data[0]);
            });

            // select env
            $scope.envChange = function(e, tid) {
                $scope.env = e;
                $scope.templateChange(tid);
            };

            // project variable
            $scope.vars = [];
            $scope.addVar = function(v) {
                $scope.varForm.varName.$error.unique = false;
                $scope.varForm.varName.$error.required = false;
                $scope.varForm.varValue.$error.required = false;

                if (angular.isUndefined($scope.env.id )) {
                    return;
                }
                v.envId = $scope.env.id;   // bind env

                if (findInVars($scope.vars, v) != -1) {
                    $scope.varForm.varName.$invalid = true;
                    $scope.varForm.varName.$error.unique = true;
                    return;
                }
                if (v.name.trim().length < 1 && v.value.trim().length < 1) {
                    $scope.varForm.varName.$invalid = true;
                    $scope.varForm.varValue.$invalid = true;
                    $scope.varForm.varName.$error.required = true;
                    $scope.varForm.varValue.$error.required = true;
                    return;
                }
                if (v.name.trim().length < 1 ) {
                    $scope.varForm.varName.$invalid = true;
                    $scope.varForm.varName.$error.required = true;
                    return;
                }
                if (v.value.trim().length < 1) {
                    $scope.varForm.varValue.$invalid = true;
                    $scope.varForm.varValue.$error.required = true;
                    return;
                }

                $scope.vars.push(angular.copy(v));
                v.name = ""; v.value = ""; v.level = 'unsafe'; // clear input value
            };

            function findInVars(vars, v) {
                var find = -1;
                angular.forEach(vars, function(_v, index) {
                    if (find < 0 && _v.name == v.name && _v.envId == v.envId) {
                        find = index;
                    }
                });
                return find;
            }

            $scope.deleteVar = function(v) {
                var index = findInVars($scope.vars, v);
                if (index != -1) {
                    $scope.vars.splice(index, 1);
                }
            };

        }]);

    app.controller('ProjectUpdateCtrl', ['$scope', '$stateParams', '$filter', '$state', 'growl', 'ProjectService', 'TemplateService', 'EnvService',
        function($scope, $stateParams, $filter, $state, growl, ProjectService, TemplateService, EnvService) {
            // update
            $scope.saveOrUpdate = function(project) {
                project.items = [];
                project.variables = angular.copy($scope.vars);
                angular.forEach($scope.items, function(item) {
                    project.items.push({name: item.itemName, value: item.value, id: item.id})
                });

                project.lastUpdated = $filter('date')(project.lastUpdated, "yyyy-MM-dd HH:mm:ss")
                ProjectService.update($stateParams.id, $scope.env.id, angular.toJson(project), function(data) {
                    if (data.r === 'exist') {
                        $scope.form.name.$invalid = true;
                        $scope.form.name.$error.exists = true;
                    } else {
                        growl.addSuccessMessage("修改成功");
                        if ($state.includes('admin.project')) {
                            $state.go("admin.project");
                        } else {
                            $state.go("profile.project");
                        }
                    }
                });

            };

            ProjectService.get($stateParams.id, function(data) {
                // update form reset
                $scope.master = data;
                $scope.reset = function() {
                    $scope.project = angular.copy($scope.master);
                };
                $scope.isUnchanged = function(project) {
                    return angular.equals(project, $scope.master);
                };
                $scope.reset();

                // load env all
                EnvService.getAll(function(data) {
                    if (data == null || data.length == 0) {
                        return;
                    }
                    $scope.envs = data;
                    $scope.envChange(data[0], $scope.project.templateId);
                });
            });

            // load template all
            TemplateService.all(function(data) {
                $scope.templates = data;
            });

            // template change
            $scope.templateChange = function(tid) {
                $scope.items = [];
                if (angular.isUndefined(tid)) {
                    return;
                }
                if (angular.isUndefined($scope.env)) {
                    return;
                }
                var currScriptVersion = $scope.env.scriptVersion
                TemplateService.itemAttrs(tid, currScriptVersion, function(data) {
                    $scope.items = data;
                    // attrs
                    ProjectService.atts($stateParams.id, function(project_attrs) {
                        angular.forEach($scope.items, function(item) {
                            angular.forEach(project_attrs, function(att) {
                                if (att.name == item.itemName) {
                                    item.value = att.value;
                                    item.id = att.id;
                                    return;
                                }
                            });
                        });
                    });
                });

                TemplateService.itemVars(tid, currScriptVersion, function(item_vars) {
                    var _vars = angular.copy($scope.vars);
                    angular.forEach(_vars, function(v, index) {
                        if (v.name.indexOf('t_') === 0) {
                            delete _vars[index]; // delete object is null
                        }
                    });
                    _vars = _vars.filter(function(e){return e}); // clear null

                    // load init variable
                    ProjectService.vars($stateParams.id, $scope.env.id, function(project_vars) {
                        if (project_vars.length < 1) {
                            angular.forEach(item_vars, function(iv) {
                                _vars.push({name: iv.itemName, value: '', level:'unsafe', envId: $scope.env.id});  // first add
                            });
                        }
                        else {
                            angular.forEach(project_vars, function(pv) {
                                if (findInVars(_vars, pv) === -1) {
                                    _vars.unshift({name: pv.name, value: pv.value, level: pv.level, envId: $scope.env.id});  // first add
                                }
                            });
                        }
                    });
                    $scope.vars = _vars;
                });
            };

            // select env
            $scope.envChange = function(e, tid) {
                $scope.env = e;
                $scope.templateChange(tid);
            };

            // project variable
            $scope.vars = [];
            $scope.addVar = function(v) {
                $scope.varForm.varName.$error.unique = false;
                $scope.varForm.varName.$error.required = false;
                $scope.varForm.varValue.$error.required = false;

                if (angular.isUndefined($scope.env.id )) {
                    return;
                }
                v.envId = $scope.env.id;   // bind env

                if (findInVars($scope.vars, v) != -1) {
                    $scope.varForm.varName.$invalid = true;
                    $scope.varForm.varName.$error.unique = true;
                    return;
                }
                if (v.name.trim().length < 1 && v.value.trim().length < 1) {
                    $scope.varForm.varName.$invalid = true;
                    $scope.varForm.varValue.$invalid = true;
                    $scope.varForm.varName.$error.required = true;
                    $scope.varForm.varValue.$error.required = true;
                    return;
                }
                if (v.name.trim().length < 1 ) {
                    $scope.varForm.varName.$invalid = true;
                    $scope.varForm.varName.$error.required = true;
                    return;
                }
                if (v.value.trim().length < 1) {
                    $scope.varForm.varValue.$invalid = true;
                    $scope.varForm.varValue.$error.required = true;
                    return;
                }
                $scope.vars.push(angular.copy(v));
                v.name = ""; v.value = ""; v.level='unsafe'; // clear input value
            };

            function findInVars(vars, v) {
                var find = -1;
                angular.forEach(vars, function(_v, index) {
                    if (find < 0 && _v.name == v.name && _v.envId == v.envId) {
                        find = index;
                    }
                });
                return find;
            }

            $scope.deleteVar = function(v) {
                var index = findInVars($scope.vars, v)
                if (index != -1) {
                    $scope.vars.splice(index, 1);
                }
            };
        }]);

    // ===================================================================
    // ------------------------------项目版本-----------------------------—
    // ===================================================================
    app.controller('VersionCtrl', ['$scope', '$stateParams', '$modal', 'growl', 'VersionService',
        function($scope, $stateParams, $modal, growl, VersionService) {

            $scope.currentPage = 1;
            $scope.pageSize = 10;

            $scope.searchForm = function(vs) {
                // count
                VersionService.count(vs, $stateParams.id, function(data) {
                    $scope.totalItems = data;
                });

                // list
                VersionService.getPage(vs, $stateParams.id, 0, $scope.pageSize, function(data) {
                    $scope.versions = data;
                });
            };
            // default list
            $scope.searchForm($scope.s_name);

            // set page
            $scope.setPage = function (pageNo) {
                VersionService.getPage($scope.s_name, $stateParams.id, pageNo - 1, $scope.pageSize, function(data) {
                    $scope.versions = data;
                });
            };

            // remove
            $scope.delete = function(id, index) {
                var modalInstance = $modal.open({
                    templateUrl: 'partials/modal.html',
                    controller: function ($scope, $modalInstance) {
                        $scope.ok = function () {
                            VersionService.remove(id, function(data) {
                                $modalInstance.close(data);
                            });
                        };
                        $scope.cancel = function () {
                            $modalInstance.dismiss('cancel');
                        };
                    }
                });
                modalInstance.result.then(function(data) {
                    if (data.r === 'exist') {
                        growl.addWarnMessage('还有配置在使用该版本，请删除后再操作。。。');
                    } else {
                        $scope.versions.splice(index, 1);
                        VersionService.count($stateParams.id, function(num) {
                            $scope.totalItems = num;
                        });
                    }
                });
            };

            // checked all
            $scope.$watch('master', function(checked) {
                if (!checked) { $scope.ids = {}; return }
                angular.forEach($scope.versions, function(version) {
                    $scope.ids[version.id] = true;
                });
            });
            $scope.isEmpty = function (obj) {
                return angular.equals({}, obj);
            };
            $scope.checked = function(id, value) {
                if (!value) delete $scope.ids[id];
            };
            $scope.deleteBatch = function() {
                var modalInstance = $modal.open({
                    templateUrl: 'partials/modal.html',
                    controller: function ($scope, $modalInstance) {
                        $scope.ok = function () {
                            $modalInstance.close();
                        };
                        $scope.cancel = function () {
                            $modalInstance.dismiss('cancel');
                        };
                    }
                });
                modalInstance.result.then(function() {
                    angular.forEach($scope.ids, function(value, key) {
                        angular.forEach($scope.versions, function(user, i) {
                            if (user.id == key) {
                                $scope.versions.splice(i, 1);
                            }
                        });
                        VersionService.remove(key, function(data) {});
                    });

                    // refresh
                    $scope.master = null;
                    $scope.searchForm($scope.s_name);

                });
            };
    }]);

    app.controller('VersionCreateCtrl', ['$scope', '$filter', '$stateParams', '$state', 'VersionService',
        function($scope, $filter, $stateParams, $state, VersionService) {
            $scope.version = {projectId: $stateParams.id, vs: ''}

            $scope.saveOrUpdate = function(version) {
                version.updated = $filter('date')(new Date(), "yyyy-MM-dd HH:mm:ss")
                VersionService.save(angular.toJson(version), function(data) {
                    if (data.r === 'exist') {
                        $scope.form.vs.$invalid = true;
                        $scope.form.vs.$error.exists = true;
                    } else {
                        $state.go('^');
                    }
                });
            };

            VersionService.getNexusVersions($stateParams.id, function(data) {
                $scope.versions = data;
            });

    }]);

    app.controller('VersionUpdateCtrl', ['$scope', '$stateParams', '$filter', '$state', 'VersionService',
        function($scope, $stateParams, $filter, $state, VersionService) {
            $scope.saveOrUpdate = function(version) {
                version.updated = $filter('date')(new Date(), "yyyy-MM-dd HH:mm:ss")

                VersionService.update($stateParams.vid, angular.toJson(version), function(data) {
                    if (data.r === 'exist') {
                        $scope.form.vs.$invalid = true;
                        $scope.form.vs.$error.exists = true;
                    } else {
                        $state.go('^');
                    }
                });
            };

            VersionService.get($stateParams.vid, function(data) {
                // update form reset
                $scope.master = data;
                $scope.reset = function() {
                    $scope.version = angular.copy($scope.master);
                };
                $scope.isUnchanged = function(version) {
                    return angular.equals(version, $scope.master);
                };
                $scope.reset();
            });

            VersionService.getNexusVersions($stateParams.id, function(data) {
                $scope.versions = data;
            });
    }]);

    // ===================================================================
    // ------------------------------项目依赖-----------------------------—
    // ===================================================================
    app.controller('DependencyCtrl', ['$scope', '$stateParams', '$filter', '$state', 'DependencyService', 'ProjectService', 'growl',
        function($scope, $stateParams, $filter, $state, DependencyService, ProjectService, growl) {
            ProjectService.get($stateParams.id, function(data) {
                $scope.project = data;
                $scope.delayLoadDependency();
            });

            $scope.showDependencies = function(){
                DependencyService.get($stateParams.id, function(data){
                    $scope.groups = data
                })
            };
            $scope.delayLoadDependency = function(){
                ProjectService.getExceptSelf($stateParams.id, function(data){
                    $scope.projects = data ;
                    $scope.showDependencies() ;
                })
            };

            $scope.removeDependency = function(parent,child){
                DependencyService.removeDependency(parent.id, child.id, function(data){
                    if (data == 0) {
                        growl.addWarnMessage("解绑失败");
                    } else {
                        growl.addSuccessMessage("解绑成功");
                        $scope.showDependencies();
                    }
                })
            };

            $scope.addDependency = function(parent, child){
                if (angular.isUndefined(child)) {
                    growl.addErrorMessage("请选择项目");
                    return;
                }
                DependencyService.addDependency(parent, child, function(data){
                    if(data.r == 0){
                        growl.addWarnMessage("添加失败");
                    } else {
                        growl.addSuccessMessage("添加成功");
                        $scope.showDependencies()
                    }
                })
            };

            $scope.templateFilter = function(dep){
                return function(p){return p.templateId == dep.templateId};
            };

            $scope.getTemplateProject = function(dep){
                var subTemplateProjects = $scope.projects.map(
                    function(p){
                        if(p.name == dep.name) {
                            return p;
                        }
                    }
                ).filter(function(e){return e});
                if(subTemplateProjects.length > 0){
                    return subTemplateProjects[0];
                }
            };

            $scope.changeTemplateProject = function(parentId, oldId, newId){
                if(newId != undefined){
                    DependencyService.changeTemplateProject(parentId, oldId, newId, function(data){
                        if(data.r == 0){
                            growl.addWarnMessage("修改失败");
                        } else if(data.r == 1){
                            growl.addSuccessMessage("修改成功");
                            $scope.showDependencies();
                        }
                    })
                }
            };

        }
    ])

});
